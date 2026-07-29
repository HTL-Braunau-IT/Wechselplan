import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { captureError } from '@/lib/sentry'
import { env } from '@/env'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isFeatureEnabled } from '@/lib/entitlements'
import { truncateSubject } from '@/lib/subject-utils'
import { normalizeUsername } from '@/lib/username'
import { denyUnlessAccess } from '@/lib/api-guard'

type Semester = 'first' | 'second'

type NotenmanagementTokenResponse = {
  expires_in: number
  access_token?: string
}

type NotenmanagementStudent = {
  Matrikelnummer?: number
  Vorname?: string
  Nachname?: string
  klasse?: string
  Klasse?: string
}

function normalizeNamePart(v: string): string {
  return v.trim().toLocaleLowerCase('de-DE')
}

/**
 * Wechselplan class names embed the weekday of the schedule variant (e.g. "1AFELCMontag"),
 * but Notenmanagement only knows the base class name ("1AFELC"). Strip a trailing German
 * weekday so the LF Klasse and student class-match key use the name Notenmanagement expects.
 * Classes without a weekday suffix are returned unchanged.
 */
function classNameForNotenmanagement(name: string): string {
  return name.replace(/\s*(Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag)$/u, '').trim()
}

async function getNotenmanagementAccessToken(
  username: string,
  password: string
): Promise<{ token: string; expiresIn: number }> {
  const tokenUrl = new URL('Token', env.NOTENMANAGEMENT_BASE_URL).toString()
  const body = new URLSearchParams({
    grant_type: 'password',
    username,
    password,
  })

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  const data = (await res.json()) as NotenmanagementTokenResponse
  if (!res.ok || !data.access_token) {
    throw new Error('Notenmanagement authentication failed')
  }
  return {
    token: data.access_token,
    expiresIn: data.expires_in ?? 3600, // Default to 1 hour if not provided
  }
}

async function fetchNotenmanagementStudents(accessToken: string): Promise<NotenmanagementStudent[]> {
  const url = new URL('api/Schueler', env.NOTENMANAGEMENT_BASE_URL).toString()
  const res = await fetch(url, {
    headers: { Authorization: `bearer ${accessToken}` },
  })
  if (!res.ok) {
    throw new Error('Failed to fetch Notenmanagement students')
  }
  const data = (await res.json()) as NotenmanagementStudent[]
  return Array.isArray(data) ? data : []
}

function toLfDate(d: Date): string {
  // Notenmanagement examples use "YYYY-MM-DDT00:00:00"
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}T00:00:00`
}

export async function POST(request: Request) {
  const denied = await denyUnlessAccess('staff')
  if (denied) return denied

  let requestData: unknown
  try {
    const session = await getServerSession(authOptions)
    const username = session?.user?.name
    if (!username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (session.user?.role !== 'teacher' && session.user?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const body = (await request.json()) as {
      classId?: unknown
      groupId?: unknown
      semester?: unknown
      schoolYearId?: number
      username?: unknown
      password?: unknown
      token?: unknown
      notes?: unknown
      notesByMatrikelnummer?: unknown
    }
    requestData = body

    const groupIdParam =
      body.groupId !== undefined && body.groupId !== null
        ? typeof body.groupId === 'number'
          ? body.groupId
          : typeof body.groupId === 'string'
            ? parseInt(body.groupId, 10)
            : Number.NaN
        : null
    const groupId =
      groupIdParam !== null && !Number.isNaN(groupIdParam) ? groupIdParam : null

    if (groupId !== null && !(await isFeatureEnabled('notenmgmt_htl'))) {
      return NextResponse.json({ error: 'Feature not available' }, { status: 403 })
    }
    if (groupId === null && !(await isFeatureEnabled('notensammler'))) {
      return NextResponse.json({ error: 'Feature not available' }, { status: 403 })
    }

    const classId = typeof body.classId === 'number' ? body.classId : parseInt(String(body.classId))
    const semester = body.semester === 'first' || body.semester === 'second' ? (body.semester as Semester) : null

    // Resolve school year: from body or current
    let schoolYearId = body.schoolYearId
    if (schoolYearId == null) {
      const now = new Date()
      const current = await prisma.schoolYear.findFirst({
        where: { startDate: { lte: now }, endDate: { gte: now } },
        select: { id: true }
      })
      schoolYearId = current?.id ?? (await prisma.schoolYear.findFirst({ orderBy: { startDate: 'desc' }, select: { id: true } }))?.id
    }
    if (schoolYearId == null) {
      return NextResponse.json(
        { error: 'No school year found. Create a school year in Admin / Data / School Years first.' },
        { status: 400 }
      )
    }
    const nmUsername = typeof body.username === 'string' ? body.username : null
    const password = typeof body.password === 'string' ? body.password : null
    const providedToken = typeof body.token === 'string' ? body.token : null
    const notes = Array.isArray(body.notes) ? body.notes : null
    const notesByMatrikelnummerRaw = Array.isArray(body.notesByMatrikelnummer) ? body.notesByMatrikelnummer : []

    if (!classId || Number.isNaN(classId) || !semester || !nmUsername || !notes) {
      return NextResponse.json({ error: 'Missing or invalid parameters' }, { status: 400 })
    }

    if (!providedToken && !password) {
      return NextResponse.json({ error: 'Either token or password is required' }, { status: 400 })
    }

    const notesByStudentId = new Map<number, 1 | 2 | 3 | 4 | 5 | null>()
    const nullNoteReasonByStudentId = new Map<number, 'Nicht beurteilt' | 'Gestundet'>()
    for (const n of notes as Array<{ studentId?: unknown; note?: unknown; nullNoteReason?: unknown }>) {
      const studentId = typeof n.studentId === 'number' ? n.studentId : parseInt(String(n.studentId))
      if (!studentId || Number.isNaN(studentId)) continue
      const reason = n.nullNoteReason === 'Nicht beurteilt' || n.nullNoteReason === 'Gestundet' ? n.nullNoteReason : undefined
      if (n.note === null || n.note === undefined) {
        notesByStudentId.set(studentId, null)
        if (reason) nullNoteReasonByStudentId.set(studentId, reason)
        continue
      }
      // Notenmanagement only accepts integer grades 1-5. Prefill/half grades (e.g. 1.5) are
      // rounded to the nearest whole grade instead of being dropped to "Keine Note".
      const rawNote = typeof n.note === 'number' ? n.note : (typeof n.note === 'string' ? parseFloat(n.note) : Number.NaN)
      const noteNum = Number.isNaN(rawNote) ? Number.NaN : Math.round(rawNote)
      if (Number.isNaN(noteNum) || ![1, 2, 3, 4, 5].includes(noteNum)) {
        notesByStudentId.set(studentId, null)
        if (reason) nullNoteReasonByStudentId.set(studentId, reason)
        continue
      }
      notesByStudentId.set(studentId, noteNum as 1 | 2 | 3 | 4 | 5)
    }

    const classRecord = await prisma.class.findUnique({
      where: { id: classId },
      include: {
        students: {
          // Nested relation loads are not covered by the active-by-default
          // extension in lib/prisma, so the filter is spelled out here.
          where: { isActive: true },
          orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
          select: { id: true, firstName: true, lastName: true, groupId: true },
        },
      },
    })
    if (!classRecord) {
      return NextResponse.json({ error: 'Class not found' }, { status: 404 })
    }
    // Name Notenmanagement knows (weekday suffix stripped); used for the LF Klasse and matching.
    const nmClassName = classNameForNotenmanagement(classRecord.name)

    // For group transfer (Notenstand): filter students to this group only
    const classStudents =
      groupId !== null
        ? classRecord.students.filter((st) => st.groupId === groupId)
        : classRecord.students

    const assignments = await prisma.teacherAssignment.findMany({
      where: { classId },
      include: {
        subject: { select: { name: true } },
      },
    })
    const teacherIds = Array.from(new Set(assignments.map((a: { teacherId: number }) => a.teacherId)))
    if (teacherIds.length === 0) {
      return NextResponse.json({ error: 'No teachers assigned to class' }, { status: 400 })
    }

    let subjectName: string | undefined
    if (assignments.length > 0) {
      const subjectCounts = new Map<string, number>()
      for (const a of assignments) {
        if (a.subject?.name) subjectCounts.set(a.subject.name, (subjectCounts.get(a.subject.name) ?? 0) + 1)
      }
      let maxCount = 0
      for (const [s, c] of subjectCounts.entries()) {
        if (c > maxCount) {
          maxCount = c
          subjectName = s
        }
      }
    }
    if (!subjectName) {
      return NextResponse.json({ error: 'Could not determine subject for this class' }, { status: 400 })
    }
    const subjectTruncated = truncateSubject(subjectName)

    const grades = await prisma.grade.findMany({
      where: { classId, semester },
      select: { studentId: true, teacherId: true, grade: true },
    })
    const gradeByStudentTeacher = new Map<string, number>()
    for (const g of grades) {
      if (typeof g.grade === 'number') {
        gradeByStudentTeacher.set(`${g.studentId}:${g.teacherId}`, g.grade)
      }
    }

    // For group transfer: resolve current teacher name for Kommentar
    let teacherFirstName = ''
    let teacherLastName = ''
    if (groupId !== null) {
      const currentTeacher = await prisma.teacher.findUnique({
        where: { username: normalizeUsername(username) },
        select: { firstName: true, lastName: true },
      })
      if (currentTeacher) {
        teacherFirstName = currentTeacher.firstName
        teacherLastName = currentTeacher.lastName
      }
    }

    // Use provided token or get new one with password
    let accessToken: string
    let tokenExpiresIn: number | undefined
    if (providedToken) {
      accessToken = providedToken
    } else {
      if (!password) {
        return NextResponse.json({ error: 'Password required when token is not provided' }, { status: 400 })
      }
      const tokenData = await getNotenmanagementAccessToken(nmUsername, password)
      accessToken = tokenData.token
      tokenExpiresIn = tokenData.expiresIn
    }

    const nmStudents = await fetchNotenmanagementStudents(accessToken)
    // Each match carries the student's real Notenmanagement class, so combined Wechselplan
    // classes can be split into one LF per real class.
    type NmMatch = { matr: number; klasse: string }
    const nmIndex = new Map<string, NmMatch>()
    // Secondary index by name only (no class), to recover matches when the Notenmanagement
    // "klasse" differs from the Wechselplan class name (combined or cross-homeroom groups).
    // Only used when the class-qualified match misses AND the name is unique across NM.
    const nmByName = new Map<string, NmMatch[]>()
    for (const s of nmStudents) {
      const matr = s.Matrikelnummer
      const vor = s.Vorname
      const nach = s.Nachname
      const klasse = (s.klasse ?? s.Klasse ?? '').trim()
      if (!matr || !vor || !nach) continue
      const nameKey = `${normalizeNamePart(nach)}|${normalizeNamePart(vor)}`
      const match: NmMatch = { matr, klasse }
      const list = nmByName.get(nameKey) ?? []
      list.push(match)
      nmByName.set(nameKey, list)
      if (!klasse) continue
      nmIndex.set(`${normalizeNamePart(klasse)}|${nameKey}`, match)
    }

    // Group transfer: use only group students (notes from payload). Class transfer: all students with all teacher grades.
    const completeStudents =
      groupId !== null
        ? classStudents
        : classRecord.students
            .filter((st: (typeof classRecord.students)[number]) => st.groupId !== null && st.groupId !== undefined)
            .filter((st: (typeof classRecord.students)[number]): st is (typeof classRecord.students)[number] => {
              return teacherIds.every((tid) => {
                const g = gradeByStudentTeacher.get(`${st.id}:${tid}`)
                return typeof g === 'number'
              })
            })

    type NotenEntry = { Matrikelnummer: number; Note: number | null; Punkte: number; Kommentar: string }

    // When Note is null, set Kommentar: use payload nullNoteReason if provided, else infer from student grades (6 or 7)
    function commentForNullNote(st: { id: number }): string {
      const fromPayload = nullNoteReasonByStudentId.get(st.id)
      if (fromPayload) return fromPayload
      let hasGestundet = false
      let hasNichtBeurteilt = false
      for (const tid of teacherIds) {
        const g = gradeByStudentTeacher.get(`${st.id}:${tid}`)
        if (g === 7) hasGestundet = true
        if (g === 6) hasNichtBeurteilt = true
      }
      if (hasGestundet) return 'Gestundet'
      if (hasNichtBeurteilt) return 'Nicht beurteilt'
      return ''
    }

    // Map Matrikelnummer -> real Notenmanagement class, for grouping NM-only payload entries.
    const klasseByMatr = new Map<number, string>()
    for (const s of nmStudents) {
      if (s.Matrikelnummer) klasseByMatr.set(s.Matrikelnummer, (s.klasse ?? s.Klasse ?? '').trim())
    }

    // Build Noten entries grouped by the student's real Notenmanagement class. A combined
    // Wechselplan class yields one bucket per real class, each becoming its own LF.
    const unmatched: string[] = []
    const notenByKlasse = new Map<string, NotenEntry[]>()
    const pushNote = (klasse: string, entry: NotenEntry) => {
      const list = notenByKlasse.get(klasse) ?? []
      list.push(entry)
      notenByKlasse.set(klasse, list)
    }
    let notenCount = 0
    for (const st of completeStudents) {
      if (!notesByStudentId.has(st.id)) continue
      const nameKey = `${normalizeNamePart(st.lastName)}|${normalizeNamePart(st.firstName)}`
      let match = nmIndex.get(`${normalizeNamePart(nmClassName)}|${nameKey}`) ?? null
      if (match === null) {
        // Fallback: match by name only when it is unambiguous across Notenmanagement.
        const candidates = nmByName.get(nameKey)
        if (candidates && candidates.length === 1) match = candidates[0]!
      }
      if (!match || !match.klasse) {
        unmatched.push(`${st.lastName} ${st.firstName}`)
        continue
      }
      const note = notesByStudentId.get(st.id) ?? null
      const kommentar = note === null ? commentForNullNote(st) : ''
      pushNote(match.klasse, { Matrikelnummer: match.matr, Note: note, Punkte: 0.0, Kommentar: kommentar })
      notenCount++
    }

    // Add entries for NM-only students (in Notenmanagement but not locally matched)
    for (const item of notesByMatrikelnummerRaw as Array<{ matrikelnummer?: unknown; note?: unknown }>) {
      const matr = typeof item.matrikelnummer === 'number' ? item.matrikelnummer : parseInt(String(item.matrikelnummer))
      if (!matr || Number.isNaN(matr)) continue
      let note: number | null = null
      if (item.note !== null && item.note !== undefined) {
        const n = typeof item.note === 'number' ? item.note : (typeof item.note === 'string' ? parseInt(item.note, 10) : Number.NaN)
        if (!Number.isNaN(n) && [1, 2, 3, 4, 5].includes(n)) note = n as 1 | 2 | 3 | 4 | 5
      }
      const klasse = klasseByMatr.get(matr) || nmClassName
      pushNote(klasse, { Matrikelnummer: matr, Note: note, Punkte: 0.0, Kommentar: '' })
      notenCount++
    }

    if (notenCount === 0) {
      const sample = unmatched.slice(0, 8)
      const more = unmatched.length > sample.length ? ` (+${unmatched.length - sample.length})` : ''
      return NextResponse.json(
        {
          error:
            unmatched.length > 0
              ? `Keine Schüler konnten Notenmanagement zugeordnet werden (Klasse "${nmClassName}"). Nicht gefunden: ${sample.join(', ')}${more}`
              : 'No matched students with notes to transfer',
          diagnostics: {
            class: nmClassName,
            payloadStudents: completeStudents.filter((st) => notesByStudentId.has(st.id)).length,
            unmatched,
          },
        },
        { status: 400 }
      )
    }

    const semesterLabel = semester === 'first' ? '1. Semester' : '2. Semester'
    const semesterN = semester === 'first' ? '1' : '2'
    const typ = groupId !== null ? 'Notenstand' : semester === 'first' ? 'Semesternote' : 'Jahresnote'
    const kommentar =
      groupId !== null
        ? `Notenstand Semester ${semesterN} Gruppe ${groupId} ${teacherFirstName} ${teacherLastName}`
        : `Übertrag aus Wechselplan APP, ${semesterLabel}`

    function extractLfId(body: unknown): string | null {
      const id =
        typeof body === 'object' && body !== null
          ? (body as Record<string, unknown>).LF_ID ??
            (body as Record<string, unknown>).Lf_ID ??
            (body as Record<string, unknown>).id ??
            (body as Record<string, unknown>).Id
          : null
      return typeof id === 'number' || typeof id === 'string' ? String(id) : null
    }

    function buildPayload(klasse: string, entries: NotenEntry[]) {
      return {
        LF: {
          Datum: toLfDate(new Date()),
          Klasse: klasse,
          Fach: subjectTruncated,
          Typ: typ,
          MaxPunkte: 0.0,
          Kommentar: kommentar,
        },
        Noten: entries,
      }
    }

    // POST a new LF. Returns the new LF id, or a NextResponse error.
    async function postLf(payload: unknown): Promise<{ lfId: string } | { error: NextResponse }> {
      const postUrl = new URL('api/LFs', env.NOTENMANAGEMENT_BASE_URL).toString()
      const postRes = await fetch(postUrl, {
        method: 'POST',
        headers: { Authorization: `bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const ct = postRes.headers.get('content-type') ?? ''
      const postBody = ct.includes('application/json') ? await postRes.json() : await postRes.text()
      if (!postRes.ok) {
        return { error: NextResponse.json({ error: 'Notenmanagement /api/LFs POST failed', details: postBody }, { status: 502 }) }
      }
      const lfId = extractLfId(postBody)
      if (lfId === null) {
        return { error: NextResponse.json({ error: 'LF created but no LF_ID returned', response: postBody }, { status: 502 }) }
      }
      return { lfId }
    }

    // PUT an existing LF; returns the (possibly new) LF id, or null when the LF could not be updated.
    async function putLf(lfId: string, payload: unknown): Promise<string | null> {
      const putUrl = new URL(`api/LFs/${encodeURIComponent(lfId)}`, env.NOTENMANAGEMENT_BASE_URL).toString()
      const putRes = await fetch(putUrl, {
        method: 'PUT',
        headers: { Authorization: `bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const ct = putRes.headers.get('content-type') ?? ''
      const putBody = ct.includes('application/json') ? await putRes.json() : await putRes.text()
      if (!putRes.ok) {
        console.warn(
          `[Notenmanagement] PUT /api/LFs/${lfId} failed (status ${putRes.status}); will create a new LF instead.`,
          typeof putBody === 'string' ? putBody : JSON.stringify(putBody)
        )
        return null
      }
      return extractLfId(putBody) ?? lfId
    }

    // One LF per real Notenmanagement class (combined classes split here).
    const klassen = [...notenByKlasse.keys()]
    const results: Array<{ klasse: string; lfId: string; count: number }> = []
    for (const klasse of klassen) {
      const entries = notenByKlasse.get(klasse)!
      const payload = buildPayload(klasse, entries)
      console.log(`[Notenmanagement] transfer class "${klasse}" (${entries.length} Noten):`, JSON.stringify(payload, null, 2))

      // Find the record for this real class. For a single-class transfer also accept the
      // legacy record written before nmKlasse existed (nmKlasse = null) and adopt it.
      let existing = await prisma.notenmanagementTransfer.findFirst({
        where: { classId, groupId, semester, schoolYearId, nmKlasse: klasse },
      })
      if (!existing && klassen.length === 1) {
        existing = await prisma.notenmanagementTransfer.findFirst({
          where: { classId, groupId, semester, schoolYearId, nmKlasse: null },
        })
      }

      let lfIdStr: string
      if (existing) {
        const updated = await putLf(existing.lfId, payload)
        if (updated) {
          lfIdStr = updated
        } else {
          // Stored LF gone in Notenmanagement: self-heal by creating a fresh one.
          const created = await postLf(payload)
          if ('error' in created) return created.error
          lfIdStr = created.lfId
        }
        await prisma.notenmanagementTransfer.update({
          where: { id: existing.id },
          data: { lfId: lfIdStr, nmKlasse: klasse },
        })
      } else {
        const created = await postLf(payload)
        if ('error' in created) return created.error
        lfIdStr = created.lfId
        await prisma.notenmanagementTransfer.create({
          data: { classId, groupId, semester, schoolYearId, lfId: lfIdStr, nmKlasse: klasse },
        })
      }
      results.push({ klasse, lfId: lfIdStr, count: entries.length })
    }

    return NextResponse.json({
      success: true,
      transfers: results,
      lfId: results[0]?.lfId, // backward-compatible single id
      sentCount: notenCount,
      // Include token data if a new token was generated
      ...(tokenExpiresIn && { token: accessToken, tokenExpiresIn }),
    })
  } catch (error) {
    captureError(error, {
      location: 'api/notensammler/transfer',
      type: 'transfer',
      extra: { requestData },
    })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Transfer failed' }, { status: 500 })
  }
}


