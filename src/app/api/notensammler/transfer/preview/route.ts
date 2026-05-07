import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { captureError } from '@/lib/sentry'
import { truncateAvgToNote } from '@/lib/utils'
import { env } from '~/env'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isFeatureEnabled } from '@/lib/entitlements'
import { truncateSubject } from '@/lib/subject-utils'
import { badRequest, forbidden, notFound, ok, serverError, unauthorized } from '@/lib/api-response'

type Semester = 'first' | 'second'

type NotenmanagementTokenResponse = {
  access_token?: string
  token_type?: string
  expires_in?: number
  role?: string
}

type NotenmanagementStudent = {
  Matrikelnummer?: number
  Student_ID?: string
  Vorname?: string
  Nachname?: string
  klasse?: string
  Klasse?: string
  EMailAdresse1?: string
  EMailAdresse2?: string
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
    if (!(await isFeatureEnabled('notensammler'))) {
      return forbidden('Feature not available')
    }
    if (!(await isFeatureEnabled('notenmgmt_htl'))) {
      return forbidden('Feature not available')
    }

    const body = (await request.json()) as {
      classId?: unknown
      semester?: unknown
      username?: unknown
      password?: unknown
      token?: unknown
    }
    requestData = body

    const classId = typeof body.classId === 'number' ? body.classId : parseInt(String(body.classId))
    const semester = body.semester === 'first' || body.semester === 'second' ? (body.semester as Semester) : null
    const nmUsername = typeof body.username === 'string' ? body.username : null
    const password = typeof body.password === 'string' ? body.password : null
    const providedToken = typeof body.token === 'string' ? body.token : null

    if (!classId || Number.isNaN(classId) || !semester || !nmUsername) {
      return badRequest('Missing or invalid parameters')
    }

    if (!providedToken && !password) {
      return badRequest('Either token or password is required')
    }

    const classRecord = await prisma.class.findUnique({
      where: { id: classId }
    })
    if (!classRecord) {
      return notFound('Class not found')
    }

    const currentYear = await prisma.schoolYear.findFirst({
      where: { isCurrent: true },
      select: { id: true }
    }) ?? await prisma.schoolYear.findFirst({
      orderBy: { startDate: 'desc' },
      select: { id: true }
    })
    const memberships = currentYear
      ? await prisma.classMembership.findMany({
          where: { classId, schoolYearId: currentYear.id },
          select: { studentId: true }
        })
      : []
    const classStudents = memberships.length > 0
      ? await prisma.student.findMany({
          where: { id: { in: memberships.map(m => m.studentId) } },
          orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
          select: { id: true, firstName: true, lastName: true }
        })
      : []

    const assignments = await prisma.teacherAssignment.findMany({
      where: { classId },
      include: {
        teacher: { select: { id: true, firstName: true, lastName: true } },
        subject: { select: { name: true } },
      },
    })

    const teacherIds = Array.from(new Set(assignments.map((a) => a.teacherId)))
    if (teacherIds.length === 0) {
      return badRequest('No teachers assigned to class')
    }

    // Determine subject to display (most common subject from assignments), same as notensammler
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

    const nmIndex = new Map<string, number>() // key: class|lastname|firstname -> Matrikelnummer
    for (const s of nmStudents) {
      const matr = s.Matrikelnummer
      const vor = s.Vorname
      const nach = s.Nachname
      const klasse = s.klasse ?? s.Klasse
      if (!matr || !vor || !nach || !klasse) continue
      const key = `${normalizeNamePart(klasse)}|${normalizeNamePart(nach)}|${normalizeNamePart(vor)}`
      nmIndex.set(key, matr)
    }

    type PreviewStudent = {
      studentId: number
      firstName: string
      lastName: string
      avg: number | null
      note: 1 | 2 | 3 | 4 | 5 | null
      matched: boolean
      matrikelnummer: number | null
      hasNbOrGestunden?: boolean
      /** When note is null and hasNbOrGestunden: display "Nicht beurteilt" or "Gestundet" */
      nullNoteLabel?: 'Nicht beurteilt' | 'Gestundet'
    }

    const classNorm = normalizeNamePart(classRecord.name)
    const weekdayGroups = await prisma.studentWeekdayGroup.findMany({
      where: { studentId: { in: classStudents.map((s) => s.id) } },
      select: { studentId: true },
      distinct: ['studentId']
    })
    const studentsWithAnyGroup = new Set<number>(weekdayGroups.map((row) => row.studentId))

    // Students with all teacher grades and no 6/7 (numeric note)
    const completeStudents = classStudents
      .filter((st) => studentsWithAnyGroup.has(st.id))
      .map((st): PreviewStudent | null => {
        const teacherGrades: number[] = []
        for (const tid of teacherIds) {
          const g = gradeByStudentTeacher.get(`${st.id}:${tid}`)
          if (typeof g !== 'number') return null
          teacherGrades.push(g)
        }
        if (teacherGrades.length !== teacherIds.length) return null

        if (teacherGrades.some((g) => g === 6 || g === 7)) return null

        const avg = teacherGrades.reduce((a, b) => a + b, 0) / teacherGrades.length
        const note = truncateAvgToNote(avg)
        const key = `${classNorm}|${normalizeNamePart(st.lastName)}|${normalizeNamePart(st.firstName)}`
        const matrikelnummer = nmIndex.get(key) ?? null

        return {
          studentId: st.id,
          firstName: st.firstName,
          lastName: st.lastName,
          avg,
          note,
          matched: matrikelnummer !== null,
          matrikelnummer,
        }
      })
      .filter((s): s is PreviewStudent => s !== null)

    // Students with all teacher grades but at least one 6 or 7 (Keine Note by default)
    const studentsWithNbOrGestunden = classStudents
      .filter((st) => studentsWithAnyGroup.has(st.id))
      .map((st): PreviewStudent | null => {
        const teacherGrades: number[] = []
        for (const tid of teacherIds) {
          const g = gradeByStudentTeacher.get(`${st.id}:${tid}`)
          if (typeof g !== 'number') return null
          teacherGrades.push(g)
        }
        if (teacherGrades.length !== teacherIds.length) return null

        if (!teacherGrades.some((g) => g === 6 || g === 7)) return null

        const hasGestundet = teacherGrades.some((g) => g === 7)
        const nullNoteLabel = hasGestundet ? 'Gestundet' : ('Nicht beurteilt' as const)

        const key = `${classNorm}|${normalizeNamePart(st.lastName)}|${normalizeNamePart(st.firstName)}`
        const matrikelnummer = nmIndex.get(key) ?? null

        return {
          studentId: st.id,
          firstName: st.firstName,
          lastName: st.lastName,
          avg: null,
          note: null,
          matched: matrikelnummer !== null,
          matrikelnummer,
          hasNbOrGestunden: true,
          nullNoteLabel,
        }
      })
      .filter((s): s is PreviewStudent => s !== null)

    const students = [...completeStudents, ...studentsWithNbOrGestunden]

    // Matrikelnummer of all matched students (will get an entry in transfer, numeric or Keine Note)
    const matchedMatrikelnummer = new Set(
      students.filter((s) => s.matched && s.matrikelnummer != null).map((s) => s.matrikelnummer!)
    )

    const nmStudentsWithoutGradeOrMatch = nmStudents
      .filter((s) => {
        const matr = s.Matrikelnummer
        const klasse = s.klasse ?? s.Klasse
        if (!matr || !klasse) return false
        return normalizeNamePart(klasse) === classNorm && !matchedMatrikelnummer.has(matr)
      })
      .map((s) => ({
        Matrikelnummer: s.Matrikelnummer!,
        Student_ID: s.Student_ID,
        Nachname: s.Nachname ?? '',
        Vorname: s.Vorname ?? '',
        Klasse: s.klasse ?? s.Klasse,
        EMailAdresse1: s.EMailAdresse1,
        EMailAdresse2: s.EMailAdresse2,
      }))

    // Fetch transfer status for this class
    const transfers = await prisma.notenmanagementTransfer.findMany({
      where: { classId },
      select: { semester: true, lfId: true },
    })

    const transferStatus = {
      first: {
        transferred: transfers.some((t) => t.semester === 'first'),
        lfId: transfers.find((t) => t.semester === 'first')?.lfId ?? null,
      },
      second: {
        transferred: transfers.some((t) => t.semester === 'second'),
        lfId: transfers.find((t) => t.semester === 'second')?.lfId ?? null,
      },
    }

    return ok({
      classId,
      className: classRecord.name,
      subjectName,
      subjectTruncated,
      semester,
      teacherCount: teacherIds.length,
      students,
      transferStatus,
      counts: {
        totalStudents: classStudents.length,
        completeStudents: completeStudents.length,
        matchedCompleteStudents: students.filter((s) => s.matched).length,
        unmatchedCompleteStudents: students.filter((s) => !s.matched).length,
      },
      nmStudentsWithoutGradeOrMatch,
      // Include token data if a new token was generated
      ...(tokenExpiresIn && { token: accessToken, tokenExpiresIn }),
    })
  } catch (error) {
    captureError(error, {
      location: 'api/notensammler/transfer/preview',
      type: 'preview',
      extra: { requestData },
    })
    return serverError(error instanceof Error ? error.message : 'Failed to build preview')
  }
}


