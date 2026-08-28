import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { captureError } from '@/lib/sentry'
import { isFeatureEnabled } from '@/lib/entitlements'
import { normalizeUsername } from '@/lib/username'
import { requireAccess } from '@/lib/api-guard'
import { resolveSchoolYearId } from '@/lib/school-year'
import { extractLfId, getNmToken, NmApiError, nmSend } from '@/lib/notenmanagement/server-client'
import {
  deriveSubjectForClass,
  lfTypeFor,
  nmNoteFromEndnote,
  toLfDate,
  type NmNoteResult,
} from '@/lib/notenmanagement/grade-mapping'

type Semester = 'first' | 'second'

interface NoteInput {
  studentId: number
  note: number | null
  nullNoteReason?: 'Nicht beurteilt' | 'Gestundet'
}

interface NotenEntry {
  Matrikelnummer: number
  Note: number | null
  Punkte: number
  Kommentar: string
}

function parseOptionalInt(value: unknown): number | null {
  if (typeof value === 'number') return Number.isNaN(value) ? null : value
  if (typeof value === 'string') {
    const n = parseInt(value, 10)
    return Number.isNaN(n) ? null : n
  }
  return null
}

/** Parse the per-student notes/overrides payload into a lookup by studentId. */
function parseNotes(raw: unknown): Map<number, NmNoteResult> {
  const out = new Map<number, NmNoteResult>()
  if (!Array.isArray(raw)) return out
  for (const item of raw as NoteInput[]) {
    const studentId = parseOptionalInt(item?.studentId)
    if (studentId == null) continue
    const reason =
      item.nullNoteReason === 'Nicht beurteilt' || item.nullNoteReason === 'Gestundet'
        ? item.nullNoteReason
        : null
    if (item.note === null || item.note === undefined) {
      out.set(studentId, {
        note: null,
        kommentar: reason ?? '',
        nullNoteLabel: reason,
      })
      continue
    }
    const rounded = Math.round(
      typeof item.note === 'number' ? item.note : parseFloat(String(item.note)),
    )
    if (![1, 2, 3, 4, 5].includes(rounded)) {
      out.set(studentId, { note: null, kommentar: reason ?? '', nullNoteLabel: reason })
      continue
    }
    out.set(studentId, {
      note: rounded as 1 | 2 | 3 | 4 | 5,
      kommentar: '',
      nullNoteLabel: null,
    })
  }
  return out
}

export async function POST(request: Request) {
  const gate = await requireAccess('staff')
  if (!gate.ok) return gate.response

  let requestData: unknown
  try {
    const session = gate.session
    const sessionName = session?.user?.name
    if (!sessionName) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await request.json()) as Record<string, unknown>
    // Only keep non-secret identifiers for the error log. The body also carries
    // the teacher's NM `password`/`token` and grade `notes`, which must never
    // reach the admin-visible Fehlerprotokoll.
    requestData = {
      classId: body.classId,
      groupId: body.groupId,
      semester: body.semester,
      username: body.username,
    }

    const groupId = parseOptionalInt(body.groupId)
    const isGroup = groupId !== null

    // Feature gates: group (Notenstand) needs the HTL feature; class (Endnote) the Notensammler.
    if (isGroup && !(await isFeatureEnabled('notenmgmt_htl'))) {
      return NextResponse.json({ error: 'Feature not available' }, { status: 403 })
    }
    if (!isGroup && !(await isFeatureEnabled('notensammler'))) {
      return NextResponse.json({ error: 'Feature not available' }, { status: 403 })
    }

    const classId = parseOptionalInt(body.classId)
    const semester: Semester | null =
      body.semester === 'first' || body.semester === 'second' ? body.semester : null
    const nmUsername = typeof body.username === 'string' ? body.username : null
    const password = typeof body.password === 'string' ? body.password : null
    const providedToken = typeof body.token === 'string' ? body.token : null
    // `notes` = explicit per-student values (group flow) or overrides (class flow).
    const overrides = parseNotes(body.notes ?? body.overrides)

    if (classId == null || semester == null || !nmUsername) {
      return NextResponse.json({ error: 'Missing or invalid parameters' }, { status: 400 })
    }
    if (!providedToken && !password) {
      return NextResponse.json({ error: 'Either token or password is required' }, { status: 400 })
    }

    // Resolve school year (body or current/latest).
    const schoolYearId = await resolveSchoolYearId(body.schoolYearId)
    if (schoolYearId == null) {
      return NextResponse.json(
        {
          error: 'No school year found. Create a school year in Admin / Data / School Years first.',
        },
        { status: 400 },
      )
    }

    const classRecord = await prisma.class.findUnique({
      where: { id: classId },
      include: {
        students: {
          where: { isActive: true },
          orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
          select: {
            id: true,
            firstName: true,
            lastName: true,
            groupId: true,
            matrikelnummer: true,
            nmKlasse: true,
          },
        },
      },
    })
    if (!classRecord) {
      return NextResponse.json({ error: 'Class not found' }, { status: 404 })
    }

    const assignments = await prisma.teacherAssignment.findMany({
      where: { classId },
      include: { subject: { select: { name: true } } },
    })
    if (assignments.length === 0) {
      return NextResponse.json({ error: 'No teachers assigned to class' }, { status: 400 })
    }
    const subject = deriveSubjectForClass(assignments)
    if (!subject) {
      return NextResponse.json(
        { error: 'Could not determine subject for this class' },
        { status: 400 },
      )
    }

    // Scope: group flow → only that rotation group; class flow → group-assigned students.
    const scopedStudents = classRecord.students.filter(st =>
      isGroup ? st.groupId === groupId : st.groupId !== null && st.groupId !== undefined,
    )

    // Base Endnote (class flow only) from the reviewed FinalGrade — the single source of truth.
    const finalGradeByStudent = new Map<number, number | null>()
    if (!isGroup) {
      const finals = await prisma.finalGrade.findMany({
        where: { classId, semester, schoolYearId },
        select: { studentId: true, grade: true },
      })
      for (const f of finals) finalGradeByStudent.set(f.studentId, f.grade)
    }

    // Group teacher name for the Notenstand comment.
    let teacherLabel = ''
    if (isGroup) {
      const teacher = await prisma.teacher.findUnique({
        where: { username: normalizeUsername(sessionName) },
        select: { firstName: true, lastName: true },
      })
      if (teacher) teacherLabel = `${teacher.firstName} ${teacher.lastName}`.trim()
    }

    // Resolve the note to send per student.
    const unlinked: string[] = []
    const noEndnote: string[] = []
    const notenByKlasse = new Map<string, NotenEntry[]>()
    let sentCount = 0

    for (const st of scopedStudents) {
      const name = `${st.lastName} ${st.firstName}`
      const matrikel = Number(st.matrikelnummer)
      if (!st.matrikelnummer || !Number.isFinite(matrikel)) {
        unlinked.push(name)
        continue
      }

      let resolved: NmNoteResult | undefined = overrides.get(st.id)
      if (!resolved) {
        if (isGroup) {
          // Notenstand: only students the client provided a value for are sent.
          continue
        }
        const finalGrade = finalGradeByStudent.get(st.id)
        if (finalGrade == null) {
          noEndnote.push(name)
          continue
        }
        resolved = nmNoteFromEndnote(finalGrade)
      }

      const trimmedNmKlasse = st.nmKlasse?.trim()
      const klasse =
        trimmedNmKlasse && trimmedNmKlasse.length > 0 ? trimmedNmKlasse : classRecord.name
      const list = notenByKlasse.get(klasse) ?? []
      list.push({
        Matrikelnummer: matrikel,
        Note: resolved.note,
        Punkte: 0.0,
        Kommentar: resolved.kommentar,
      })
      notenByKlasse.set(klasse, list)
      sentCount++
    }

    if (sentCount === 0) {
      const reasonParts: string[] = []
      if (unlinked.length) reasonParts.push(`${unlinked.length} nicht verknüpft`)
      if (noEndnote.length) reasonParts.push(`${noEndnote.length} ohne Endnote`)
      return NextResponse.json(
        {
          error:
            reasonParts.length > 0
              ? `Keine Noten zum Übertragen (${reasonParts.join(', ')}).`
              : 'Keine Noten zum Übertragen.',
          unlinked,
          noEndnote,
        },
        { status: 400 },
      )
    }

    // Authenticate as the teacher (LFs are attributed to them).
    let accessToken: string
    let tokenExpiresIn: number | undefined
    if (providedToken) {
      accessToken = providedToken
    } else {
      const tokenData = await getNmToken(nmUsername, password!)
      accessToken = tokenData.token
      tokenExpiresIn = tokenData.expiresIn
    }

    const semesterLabel = semester === 'first' ? '1. Semester' : '2. Semester'
    const semesterN = semester === 'first' ? '1' : '2'
    const typ = lfTypeFor(semester, isGroup)
    const kommentar = isGroup
      ? `Notenstand Semester ${semesterN} Gruppe ${groupId} ${teacherLabel}`.trim()
      : `Übertrag aus Wechselplan APP, ${semesterLabel}`

    const buildPayload = (klasse: string, entries: NotenEntry[]) => ({
      LF: {
        Datum: toLfDate(new Date()),
        Klasse: klasse,
        Fach: subject.subjectTruncated,
        Typ: typ,
        MaxPunkte: 0.0,
        Kommentar: kommentar,
      },
      Noten: entries,
    })

    // POST a fresh LF, returning its id or an error response.
    const postLf = async (
      payload: unknown,
    ): Promise<{ lfId: string } | { error: NextResponse }> => {
      const res = await nmSend('POST', 'api/LFs', accessToken, payload)
      if (!res.ok) {
        return {
          error: NextResponse.json(
            { error: 'Notenmanagement /api/LFs POST failed', details: res.body },
            { status: 502 },
          ),
        }
      }
      const lfId = extractLfId(res.body)
      if (lfId === null) {
        return {
          error: NextResponse.json(
            { error: 'LF created but no LF_ID returned', response: res.body },
            { status: 502 },
          ),
        }
      }
      return { lfId }
    }

    // PUT an existing LF. Only a genuine 404 means the LF is gone and the caller
    // may self-heal with a POST. Any other non-2xx (500/403/429/timeout) is a
    // transient/permission failure — surfacing it as an error avoids POSTing a
    // duplicate LF that would orphan the original in Notenmanagement (finding 27).
    const putLf = async (
      lfId: string,
      payload: unknown,
    ): Promise<{ ok: true; lfId: string } | { deleted: true } | { error: NextResponse }> => {
      const res = await nmSend('PUT', `api/LFs/${encodeURIComponent(lfId)}`, accessToken, payload)
      if (res.ok) {
        return { ok: true, lfId: extractLfId(res.body) ?? lfId }
      }
      if (res.status === 404) {
        console.warn(
          `[Notenmanagement] PUT /api/LFs/${lfId} returned 404; the LF was deleted, creating a new one.`,
        )
        return { deleted: true }
      }
      console.warn(
        `[Notenmanagement] PUT /api/LFs/${lfId} failed (status ${res.status}); not creating a duplicate.`,
      )
      return {
        error: NextResponse.json(
          { error: 'Notenmanagement /api/LFs PUT failed', details: res.body },
          { status: res.status === 403 ? 403 : 502 },
        ),
      }
    }

    // One LF per real NM class (combined Wechselplan classes split by nmKlasse).
    const klassen = [...notenByKlasse.keys()]
    const results: Array<{ klasse: string; lfId: string; count: number }> = []
    for (const klasse of klassen) {
      const entries = notenByKlasse.get(klasse)!
      const payload = buildPayload(klasse, entries)

      // Serialise the read → NM POST/PUT → persist for one transfer key. Without
      // this a double-click or client retry lets two requests both findFirst→null
      // and both POST a fresh LF, so the same Endnoten land under two LFs in the
      // external gradebook (findings 4 & 12) — the class flow is not protected by
      // the DB unique index because its groupId is NULL (NULLs are distinct in a
      // Postgres unique index). The advisory xact lock makes the second request
      // block until the first commits its create, then take the PUT path.
      //
      // The NM HTTP calls run inside the transaction so the lock is held across
      // them; the timeout is sized to the NM client's own 20s ceiling. This is an
      // infrequent, teacher-initiated action, so briefly holding a connection is
      // an acceptable cost for correctness on this Zeugnis-grade write path.
      const lockKey = `nm-transfer:${classId}:${groupId ?? 'null'}:${semester}:${schoolYearId}:${klasse}`
      const outcome = await prisma.$transaction(
        async (tx): Promise<{ lfId: string } | { error: NextResponse }> => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`

          let existing = await tx.notenmanagementTransfer.findFirst({
            where: { classId, groupId, semester, schoolYearId, nmKlasse: klasse },
          })
          if (!existing && klassen.length === 1) {
            existing = await tx.notenmanagementTransfer.findFirst({
              where: { classId, groupId, semester, schoolYearId, nmKlasse: null },
            })
          }

          let lfIdStr: string
          if (existing) {
            const updated = await putLf(existing.lfId, payload)
            if ('error' in updated) return { error: updated.error }
            if ('ok' in updated) {
              lfIdStr = updated.lfId
            } else {
              // updated.deleted — the LF was genuinely 404, so recreate it.
              const created = await postLf(payload)
              if ('error' in created) return { error: created.error }
              lfIdStr = created.lfId
            }
            await tx.notenmanagementTransfer.update({
              where: { id: existing.id },
              data: { lfId: lfIdStr, nmKlasse: klasse },
            })
          } else {
            const created = await postLf(payload)
            if ('error' in created) return { error: created.error }
            lfIdStr = created.lfId
            await tx.notenmanagementTransfer.create({
              data: { classId, groupId, semester, schoolYearId, lfId: lfIdStr, nmKlasse: klasse },
            })
          }
          return { lfId: lfIdStr }
        },
        { timeout: 30_000, maxWait: 25_000 },
      )
      if ('error' in outcome) return outcome.error
      results.push({ klasse, lfId: outcome.lfId, count: entries.length })
    }

    return NextResponse.json({
      success: true,
      transfers: results,
      lfId: results[0]?.lfId,
      sentCount,
      unlinked,
      noEndnote,
      ...(tokenExpiresIn && { token: accessToken, tokenExpiresIn }),
    })
  } catch (error) {
    const status = error instanceof NmApiError ? error.status : 500
    captureError(error, {
      location: 'api/notensammler/transfer',
      type: 'transfer',
      extra: { requestData },
    })
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Transfer failed' },
      { status: status === 401 ? 401 : status >= 500 ? 500 : status },
    )
  }
}
