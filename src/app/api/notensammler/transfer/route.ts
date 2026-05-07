import { prisma } from '@/lib/prisma'
import { captureError } from '@/lib/sentry'
import { env } from '~/env'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isFeatureEnabled } from '@/lib/entitlements'
import { truncateSubject } from '@/lib/subject-utils'
import { normalizeUsername } from '@/lib/username'
import { badRequest, forbidden, notFound, ok, serverError, unauthorized } from '@/lib/api-response'

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
  let requestData: unknown
  try {
    const session = await getServerSession(authOptions)
    const username = session?.user?.name
    if (!username) {
      return unauthorized('Unauthorized')
    }
    if (session.user?.role !== 'teacher' && session.user?.role !== 'admin') {
      return forbidden('Forbidden')
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

    if (!(await isFeatureEnabled('notenmgmt_htl'))) {
      return forbidden('Feature not available')
    }
    if (groupId === null && !(await isFeatureEnabled('notensammler'))) {
      return forbidden('Feature not available')
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
      return badRequest('No school year found. Create a school year in Admin / Data / School Years first.')
    }
    const nmUsername = typeof body.username === 'string' ? body.username : null
    const password = typeof body.password === 'string' ? body.password : null
    const providedToken = typeof body.token === 'string' ? body.token : null
    const notes = Array.isArray(body.notes) ? body.notes : null
    const notesByMatrikelnummerRaw = Array.isArray(body.notesByMatrikelnummer) ? body.notesByMatrikelnummer : []

    if (!classId || Number.isNaN(classId) || !semester || !nmUsername || !notes) {
      return badRequest('Missing or invalid parameters')
    }

    if (!providedToken && !password) {
      return badRequest('Either token or password is required')
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
      const noteNum = typeof n.note === 'number' ? n.note : (typeof n.note === 'string' ? parseInt(n.note, 10) : Number.NaN)
      if (Number.isNaN(noteNum) || ![1, 2, 3, 4, 5].includes(noteNum)) {
        notesByStudentId.set(studentId, null)
        if (reason) nullNoteReasonByStudentId.set(studentId, reason)
        continue
      }
      notesByStudentId.set(studentId, noteNum as 1 | 2 | 3 | 4 | 5)
    }

    const classRecord = await prisma.class.findUnique({
      where: { id: classId }
    })
    if (!classRecord) {
      return notFound('Class not found')
    }

    const memberships = await prisma.classMembership.findMany({
      where: { classId, schoolYearId },
      select: { studentId: true }
    })
    const classStudentsList = memberships.length > 0
      ? await prisma.student.findMany({
          where: { id: { in: memberships.map(m => m.studentId) } },
          orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
          select: { id: true, firstName: true, lastName: true }
        })
      : []

    const weekdayGroups = await prisma.studentWeekdayGroup.findMany({
      where: {
        studentId: { in: classStudentsList.map((s) => s.id) },
        schoolYearId
      },
      select: { studentId: true, groupId: true }
    })
    const groupByStudentId = new Map<number, number>()
    for (const row of weekdayGroups) {
      if (!groupByStudentId.has(row.studentId)) {
        groupByStudentId.set(row.studentId, row.groupId)
      }
    }
    const classStudentsWithGroup = classStudentsList.map((student) => ({
      ...student,
      groupId: groupByStudentId.get(student.id) ?? null
    }))

    // For group transfer (Notenstand): filter students to this group only
    const classStudents =
      groupId !== null
        ? classStudentsWithGroup.filter((st) => st.groupId === groupId)
        : classStudentsWithGroup

    const assignments = await prisma.teacherAssignment.findMany({
      where: { classId },
      include: {
        subject: { select: { name: true } },
      },
    })
    const teacherIds = Array.from(new Set(assignments.map((a: { teacherId: number }) => a.teacherId)))
    if (teacherIds.length === 0) {
      return badRequest('No teachers assigned to class')
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
      return badRequest('Could not determine subject for this class')
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
        return badRequest('Password required when token is not provided')
      }
      const tokenData = await getNotenmanagementAccessToken(nmUsername, password)
      accessToken = tokenData.token
      tokenExpiresIn = tokenData.expiresIn
    }

    const nmStudents = await fetchNotenmanagementStudents(accessToken)
    const nmIndex = new Map<string, number>()
    for (const s of nmStudents) {
      const matr = s.Matrikelnummer
      const vor = s.Vorname
      const nach = s.Nachname
      const klasse = s.klasse ?? s.Klasse
      if (!matr || !vor || !nach || !klasse) continue
      nmIndex.set(`${normalizeNamePart(klasse)}|${normalizeNamePart(nach)}|${normalizeNamePart(vor)}`, matr)
    }

    // Group transfer: use only group students (notes from payload). Class transfer: all students with all teacher grades.
    const completeStudents =
      groupId !== null
        ? classStudents
        : classStudentsWithGroup
            .filter((st) => st.groupId !== null && st.groupId !== undefined)
            .filter((st): st is (typeof classStudentsWithGroup)[number] => {
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

    // Build Noten entries: only matched students, with note (1-5) or "Keine Note" (null)
    const noten = completeStudents
      .map((st: (typeof classStudentsWithGroup)[number]): NotenEntry | null => {
        if (!notesByStudentId.has(st.id)) return null
        const key = `${normalizeNamePart(classRecord.name)}|${normalizeNamePart(st.lastName)}|${normalizeNamePart(st.firstName)}`
        const matrikelnummer = nmIndex.get(key) ?? null
        if (!matrikelnummer) return null
        const note = notesByStudentId.get(st.id) ?? null
        const kommentar = note === null ? commentForNullNote(st) : ''
        return {
          Matrikelnummer: matrikelnummer,
          Note: note,
          Punkte: 0.0,
          Kommentar: kommentar,
        }
      })
      .filter((n): n is NotenEntry => n !== null)

    // Add entries for NM-only students (in Notenmanagement but not locally matched)
    for (const item of notesByMatrikelnummerRaw as Array<{ matrikelnummer?: unknown; note?: unknown }>) {
      const matr = typeof item.matrikelnummer === 'number' ? item.matrikelnummer : parseInt(String(item.matrikelnummer))
      if (!matr || Number.isNaN(matr)) continue
      let note: number | null = null
      if (item.note !== null && item.note !== undefined) {
        const n = typeof item.note === 'number' ? item.note : (typeof item.note === 'string' ? parseInt(item.note, 10) : Number.NaN)
        if (!Number.isNaN(n) && [1, 2, 3, 4, 5].includes(n)) note = n as 1 | 2 | 3 | 4 | 5
      }
      noten.push({
        Matrikelnummer: matr,
        Note: note,
        Punkte: 0.0,
        Kommentar: '',
      })
    }

    if (noten.length === 0) {
      return badRequest('No matched students with notes to transfer')
    }

    // Check for existing transfer (unique: classId, groupId, semester, schoolYearId)
    // Schema has groupId as Int?; Prisma's compound unique input type can require number
    const existingTransfer = await prisma.notenmanagementTransfer.findUnique({
      where: {
        classId_groupId_semester_schoolYearId: {
          classId,
          groupId: groupId!,
          semester,
          schoolYearId,
        },
      },
    })

    const semesterLabel = semester === 'first' ? '1. Semester' : '2. Semester'
    const semesterN = semester === 'first' ? '1' : '2'
    const typ = groupId !== null ? 'Notenstand' : semester === 'first' ? 'Semesternote' : 'Jahresnote'
    const kommentar =
      groupId !== null
        ? `Notenstand Semester ${semesterN} Gruppe ${groupId} ${teacherFirstName} ${teacherLastName}`
        : `Übertrag aus Wechselplan APP, ${semesterLabel}`
    const payload = {
      LF: {
        Datum: toLfDate(new Date()),
        Klasse: classRecord.name,
        Fach: subjectTruncated,
        Typ: typ,
        MaxPunkte: 0.0,
        Kommentar: kommentar,
      },
      Noten: noten,
    }

    // Log the exact JSON payload that will be sent to Notenmanagement
    // NOTE: This runs on the server only.
    const isUpdate = !!existingTransfer
    console.log(
      `[Notenmanagement] ${isUpdate ? 'PUT' : 'POST'} /api/LFs${isUpdate ? `/${existingTransfer.lfId}` : ''} payload:`,
      JSON.stringify(payload, null, 2)
    )

    let lfIdStr: string
    if (existingTransfer) {
      // Update existing LF
      const putUrl = new URL(`api/LFs/${encodeURIComponent(existingTransfer.lfId)}`, env.NOTENMANAGEMENT_BASE_URL).toString()
      const putRes = await fetch(putUrl, {
        method: 'PUT',
        headers: {
          Authorization: `bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      const ct = putRes.headers.get('content-type') ?? ''
      const putBody = ct.includes('application/json') ? await putRes.json() : await putRes.text()
      if (!putRes.ok) {
        return serverError('Notenmanagement /api/LFs PUT failed', putBody)
      }

      // Extract new LF_ID from PUT response (may be different from existing)
      const newLfId =
        typeof putBody === 'object' && putBody !== null
          ? (putBody as Record<string, unknown>).LF_ID ??
            (putBody as Record<string, unknown>).Lf_ID ??
            (putBody as Record<string, unknown>).id ??
            (putBody as Record<string, unknown>).Id
          : null

      if (typeof newLfId !== 'number' && typeof newLfId !== 'string') {
        // If no new LF_ID returned, use existing one
        lfIdStr = existingTransfer.lfId
      } else {
        lfIdStr = String(newLfId)
      }
    } else {
      // Create new LF
      const postUrl = new URL('api/LFs', env.NOTENMANAGEMENT_BASE_URL).toString()
      const postRes = await fetch(postUrl, {
        method: 'POST',
        headers: {
          Authorization: `bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      const ct = postRes.headers.get('content-type') ?? ''
      const postBody = ct.includes('application/json') ? await postRes.json() : await postRes.text()
      if (!postRes.ok) {
        return serverError('Notenmanagement /api/LFs POST failed', postBody)
      }

      const lfId =
        typeof postBody === 'object' && postBody !== null
          ? (postBody as Record<string, unknown>).LF_ID ??
            (postBody as Record<string, unknown>).Lf_ID ??
            (postBody as Record<string, unknown>).id ??
            (postBody as Record<string, unknown>).Id
          : null

      if (typeof lfId !== 'number' && typeof lfId !== 'string') {
        return serverError('LF created but no LF_ID returned', postBody)
      }

      lfIdStr = String(lfId)
    }

    // Upsert transfer record
    await prisma.notenmanagementTransfer.upsert({
      where: {
        classId_groupId_semester_schoolYearId: {
          classId,
          groupId: groupId!,
          semester,
          schoolYearId,
        },
      },
      update: {
        lfId: lfIdStr,
      },
      create: {
        classId,
        groupId,
        semester,
        schoolYearId,
        lfId: lfIdStr,
      },
    })
    const getUrl = new URL(`api/LFs/${encodeURIComponent(lfIdStr)}/Noten?sort=Nachname|Vorname`, env.NOTENMANAGEMENT_BASE_URL).toString()
    const getRes = await fetch(getUrl, {
      headers: { Authorization: `bearer ${accessToken}` },
    })
    const confirmation = getRes.ok ? await getRes.json() : null

    return ok({
      success: true,
      lfId: lfIdStr,
      confirmation,
      sentCount: noten.length,
      skipped: {
        completeStudents: completeStudents.length,
        unmatchedOrMissingNote: completeStudents.length - noten.length,
      },
      // Include token data if a new token was generated
      ...(tokenExpiresIn && { token: accessToken, tokenExpiresIn }),
    })
  } catch (error) {
    captureError(error, {
      location: 'api/notensammler/transfer',
      type: 'transfer',
      extra: { requestData },
    })
    return serverError(error instanceof Error ? error.message : 'Transfer failed')
  }
}


