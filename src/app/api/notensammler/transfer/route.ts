import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { captureError } from '@/lib/sentry'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isFeatureEnabled } from '@/lib/entitlements'
import { normalizeUsername } from '@/lib/username'
import { denyUnlessAccess } from '@/lib/api-guard'
import {
  extractLfId,
  getNmToken,
  NmApiError,
  nmSend,
} from '@/lib/notenmanagement/server-client'
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
    const rounded = Math.round(typeof item.note === 'number' ? item.note : parseFloat(String(item.note)))
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
  const denied = await denyUnlessAccess('staff')
  if (denied) return denied

  let requestData: unknown
  try {
    const session = await getServerSession(authOptions)
    const sessionName = session?.user?.name
    if (!sessionName) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (session.user?.role !== 'teacher' && session.user?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = (await request.json()) as Record<string, unknown>
    requestData = body

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
    let schoolYearId = parseOptionalInt(body.schoolYearId)
    if (schoolYearId == null) {
      const now = new Date()
      const current = await prisma.schoolYear.findFirst({
        where: { startDate: { lte: now }, endDate: { gte: now } },
        select: { id: true },
      })
      schoolYearId =
        current?.id ??
        (await prisma.schoolYear.findFirst({ orderBy: { startDate: 'desc' }, select: { id: true } }))
          ?.id ??
        null
    }
    if (schoolYearId == null) {
      return NextResponse.json(
        { error: 'No school year found. Create a school year in Admin / Data / School Years first.' },
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
      if (!st.matrikelnummer) {
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
      const klasse = trimmedNmKlasse && trimmedNmKlasse.length > 0 ? trimmedNmKlasse : classRecord.name
      const list = notenByKlasse.get(klasse) ?? []
      list.push({
        Matrikelnummer: Number(st.matrikelnummer),
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

    // PUT an existing LF; null when the stored LF is gone (caller self-heals with a POST).
    const putLf = async (lfId: string, payload: unknown): Promise<string | null> => {
      const res = await nmSend('PUT', `api/LFs/${encodeURIComponent(lfId)}`, accessToken, payload)
      if (!res.ok) {
        console.warn(
          `[Notenmanagement] PUT /api/LFs/${lfId} failed (status ${res.status}); creating a new LF instead.`,
        )
        return null
      }
      return extractLfId(res.body) ?? lfId
    }

    // One LF per real NM class (combined Wechselplan classes split by nmKlasse).
    const klassen = [...notenByKlasse.keys()]
    const results: Array<{ klasse: string; lfId: string; count: number }> = []
    for (const klasse of klassen) {
      const entries = notenByKlasse.get(klasse)!
      const payload = buildPayload(klasse, entries)

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
