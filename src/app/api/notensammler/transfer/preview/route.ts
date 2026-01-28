import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { captureError } from '@/lib/sentry'
import { truncateAvgToNote } from '@/lib/utils'
import { env } from '~/env'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

type Semester = 'first' | 'second'

type NotenmanagementTokenResponse = {
  access_token?: string
  token_type?: string
  expires_in?: number
  role?: string
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

function truncateSubject(subjectName: string): string {
  const parts = subjectName.split('-')
  const prefix = (parts[0] ?? subjectName).trim()

  const regex = /^(.+?)(\d+)$/
  const match = regex.exec(prefix)
  if (match?.[1] && match?.[2]) {
    return `${match[1]}_${match[2]}`
  }

  if (prefix === 'ELWP' || prefix === 'NWWP') {
    return `${prefix}_4`
  }

  return prefix
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
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (session.user?.role !== 'teacher' && session.user?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
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
      return NextResponse.json({ error: 'Missing or invalid parameters' }, { status: 400 })
    }

    if (!providedToken && !password) {
      return NextResponse.json({ error: 'Either token or password is required' }, { status: 400 })
    }

    const classRecord = await prisma.class.findUnique({
      where: { id: classId },
      include: {
        students: {
          orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
          select: { id: true, firstName: true, lastName: true, groupId: true },
        },
      },
    })
    if (!classRecord) {
      return NextResponse.json({ error: 'Class not found' }, { status: 404 })
    }

    const assignments = await prisma.teacherAssignment.findMany({
      where: { classId },
      include: {
        teacher: { select: { id: true, firstName: true, lastName: true } },
        subject: { select: { name: true } },
      },
    })

    const teacherIds = Array.from(new Set(assignments.map((a) => a.teacherId)))
    if (teacherIds.length === 0) {
      return NextResponse.json({ error: 'No teachers assigned to class' }, { status: 400 })
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

    const completeStudents = classRecord.students
      .filter((st) => st.groupId !== null && st.groupId !== undefined)
      .map((st) => {
        const teacherGrades: number[] = []
        for (const tid of teacherIds) {
          const g = gradeByStudentTeacher.get(`${st.id}:${tid}`)
          if (typeof g !== 'number') return null
          teacherGrades.push(g)
        }
        if (teacherGrades.length !== teacherIds.length) return null
        const avg = teacherGrades.reduce((a, b) => a + b, 0) / teacherGrades.length
        const note = truncateAvgToNote(avg)

        const key = `${normalizeNamePart(classRecord.name)}|${normalizeNamePart(st.lastName)}|${normalizeNamePart(st.firstName)}`
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
      .filter(Boolean) as Array<{
      studentId: number
      firstName: string
      lastName: string
      avg: number
      note: 1 | 2 | 3 | 4 | 5
      matched: boolean
      matrikelnummer: number | null
    }>

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

    return NextResponse.json({
      classId,
      className: classRecord.name,
      subjectName,
      subjectTruncated,
      semester,
      teacherCount: teacherIds.length,
      students: completeStudents,
      transferStatus,
      counts: {
        totalStudents: classRecord.students.length,
        completeStudents: completeStudents.length,
        matchedCompleteStudents: completeStudents.filter((s) => s.matched).length,
        unmatchedCompleteStudents: completeStudents.filter((s) => !s.matched).length,
      },
      // Include token data if a new token was generated
      ...(tokenExpiresIn && { token: accessToken, tokenExpiresIn }),
    })
  } catch (error) {
    captureError(error, {
      location: 'api/notensammler/transfer/preview',
      type: 'preview',
      extra: { requestData },
    })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to build preview' }, { status: 500 })
  }
}


