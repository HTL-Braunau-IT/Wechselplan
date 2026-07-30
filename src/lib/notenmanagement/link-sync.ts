import { prisma } from '@/lib/prisma'
import { captureError } from '@/lib/sentry'
import { fetchNmStudents, getNmToken, type NmStudent } from './server-client'
import { getServiceCredentials, recordLinkSyncRun } from './settings'

/**
 * Matrikelnummer link sync.
 *
 * Resolves each active student's Notenmanagement identity **once** and caches it
 * on the row, so grade transfer never has to match by name/class again. The join
 * key is the Sokrates id: `Student.sokratesId` (Entra `employeeId`) equals NM's
 * `Student_ID`. Deterministic — no fuzzy name matching, no weekday-stripped
 * class-name guessing.
 *
 * Authenticates with the stored service Lehrer account (any Lehrer token may read
 * `/api/Schueler`), so it can run unattended.
 */

export interface NmLinkSyncSummary {
  totalActiveStudents: number
  withSokratesId: number
  linked: number // newly received a Matrikelnummer
  updated: number // Matrikelnummer or NM class changed
  unchanged: number // already correct
  missingSokratesId: number // no Sokrates id synced from Entra → cannot link
  noNmMatch: number // has a Sokrates id but no NM student carries it
  nmOnly: number // NM students not matched to any local student (informational)
  missingSokratesIdSamples: string[]
  noNmMatchSamples: string[]
}

const SAMPLE_LIMIT = 25

export interface StudentForLink {
  id: number
  firstName: string
  lastName: string
  sokratesId: string | null
  matrikelnummer: string | null
  nmKlasse: string | null
}

interface PlannedUpdate {
  id: number
  matrikelnummer: string
  nmKlasse: string | null
}

/** Index NM students by their (trimmed) Student_ID. Last one wins on the rare dup. */
function indexBySokratesId(nmStudents: NmStudent[]): Map<string, NmStudent> {
  const map = new Map<string, NmStudent>()
  for (const s of nmStudents) {
    const key = (s.Student_ID ?? '').trim()
    if (key) map.set(key, s)
  }
  return map
}

/**
 * Pure matching core: pairs local students to NM students by Sokrates id and
 * returns the summary plus the writes to apply. Exported for unit testing.
 */
export function computePlan(students: StudentForLink[], nmStudents: NmStudent[]) {
  const nmBySokratesId = indexBySokratesId(nmStudents)
  const matchedNmKeys = new Set<string>()

  const updates: PlannedUpdate[] = []
  const missingSokratesIdSamples: string[] = []
  const noNmMatchSamples: string[] = []
  let withSokratesId = 0
  let linked = 0
  let updated = 0
  let unchanged = 0
  let missingSokratesId = 0
  let noNmMatch = 0

  for (const st of students) {
    const name = `${st.lastName} ${st.firstName}`
    const key = st.sokratesId?.trim()
    if (!key) {
      missingSokratesId++
      if (missingSokratesIdSamples.length < SAMPLE_LIMIT) missingSokratesIdSamples.push(name)
      continue
    }
    withSokratesId++
    const nm = nmBySokratesId.get(key)
    if (!nm) {
      noNmMatch++
      if (noNmMatchSamples.length < SAMPLE_LIMIT) noNmMatchSamples.push(name)
      continue
    }
    matchedNmKeys.add(key)
    const matrikelnummer = String(nm.Matrikelnummer)
    const nmKlasse = (nm.Klasse ?? '').trim() || null
    if (st.matrikelnummer == null) {
      linked++
      updates.push({ id: st.id, matrikelnummer, nmKlasse })
    } else if (st.matrikelnummer !== matrikelnummer || (st.nmKlasse ?? null) !== nmKlasse) {
      updated++
      updates.push({ id: st.id, matrikelnummer, nmKlasse })
    } else {
      unchanged++
      // Still refresh nmLinkedAt so staleness is visible; counts as unchanged.
      updates.push({ id: st.id, matrikelnummer, nmKlasse })
    }
  }

  let nmOnly = 0
  for (const s of nmStudents) {
    const key = (s.Student_ID ?? '').trim()
    if (key && !matchedNmKeys.has(key)) nmOnly++
  }

  const summary: NmLinkSyncSummary = {
    totalActiveStudents: students.length,
    withSokratesId,
    linked,
    updated,
    unchanged,
    missingSokratesId,
    noNmMatch,
    nmOnly,
    missingSokratesIdSamples,
    noNmMatchSamples,
  }
  return { summary, updates }
}

async function loadActiveStudents(): Promise<StudentForLink[]> {
  return prisma.student.findMany({
    where: { isActive: true },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      sokratesId: true,
      matrikelnummer: true,
      nmKlasse: true,
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  })
}

export class NmLinkSyncConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NmLinkSyncConfigError'
  }
}

/** Fetch NM students with the service account. Throws {@link NmLinkSyncConfigError} if unconfigured. */
async function fetchWithServiceAccount(): Promise<NmStudent[]> {
  const creds = await getServiceCredentials()
  if (!creds) {
    throw new NmLinkSyncConfigError(
      'No Notenmanagement service account configured. Set one under Admin → Notenmanagement.',
    )
  }
  const { token } = await getNmToken(creds.username, creds.password)
  return fetchNmStudents(token)
}

/** Compute the link plan without writing anything (for a pre-run preview). */
export async function previewNmLinkSync(): Promise<NmLinkSyncSummary> {
  const [students, nmStudents] = await Promise.all([
    loadActiveStudents(),
    fetchWithServiceAccount(),
  ])
  return computePlan(students, nmStudents).summary
}

/** Run the link sync and persist the resolved Matrikelnummern. */
export async function runNmLinkSync(): Promise<NmLinkSyncSummary> {
  try {
    const [students, nmStudents] = await Promise.all([
      loadActiveStudents(),
      fetchWithServiceAccount(),
    ])
    const { summary, updates } = computePlan(students, nmStudents)
    const now = new Date()

    // Chunked to keep the transaction bounded on large tenants.
    const CHUNK = 200
    for (let i = 0; i < updates.length; i += CHUNK) {
      const chunk = updates.slice(i, i + CHUNK)
      await prisma.$transaction(
        chunk.map(u =>
          prisma.student.update({
            where: { id: u.id },
            data: { matrikelnummer: u.matrikelnummer, nmKlasse: u.nmKlasse, nmLinkedAt: now },
          }),
        ),
      )
    }

    const status = summary.noNmMatch > 0 || summary.missingSokratesId > 0 ? 'partial' : 'success'
    await recordLinkSyncRun(status, summary)
    return summary
  } catch (error) {
    captureError(error, { location: 'lib/notenmanagement/link-sync', type: 'run_nm_link_sync' })
    await recordLinkSyncRun('failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}
