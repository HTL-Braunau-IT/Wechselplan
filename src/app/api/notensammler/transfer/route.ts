import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { captureError } from '@/lib/sentry'
import { env } from '~/env'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

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
      notes?: unknown
    }
    requestData = body

    const classId = typeof body.classId === 'number' ? body.classId : parseInt(String(body.classId))
    const semester = body.semester === 'first' || body.semester === 'second' ? (body.semester as Semester) : null
    const nmUsername = typeof body.username === 'string' ? body.username : null
    const password = typeof body.password === 'string' ? body.password : null
    const providedToken = typeof body.token === 'string' ? body.token : null
    const notes = Array.isArray(body.notes) ? body.notes : null

    if (!classId || Number.isNaN(classId) || !semester || !nmUsername || !notes) {
      return NextResponse.json({ error: 'Missing or invalid parameters' }, { status: 400 })
    }

    if (!providedToken && !password) {
      return NextResponse.json({ error: 'Either token or password is required' }, { status: 400 })
    }

    const notesByStudentId = new Map<number, 1 | 2 | 3 | 4 | 5>()
    for (const n of notes as Array<{ studentId?: unknown; note?: unknown }>) {
      const studentId = typeof n.studentId === 'number' ? n.studentId : parseInt(String(n.studentId))
      const noteNum = typeof n.note === 'number' ? n.note : parseInt(String(n.note))
      if (!studentId || Number.isNaN(studentId)) continue
      if (![1, 2, 3, 4, 5].includes(noteNum)) continue
      notesByStudentId.set(studentId, noteNum as 1 | 2 | 3 | 4 | 5)
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
    const nmIndex = new Map<string, number>()
    for (const s of nmStudents) {
      const matr = s.Matrikelnummer
      const vor = s.Vorname
      const nach = s.Nachname
      const klasse = s.klasse ?? s.Klasse
      if (!matr || !vor || !nach || !klasse) continue
      nmIndex.set(`${normalizeNamePart(klasse)}|${normalizeNamePart(nach)}|${normalizeNamePart(vor)}`, matr)
    }

    // Only students with all teacher grades (same filter as preview)
    const completeStudents = classRecord.students
      .filter((st: (typeof classRecord.students)[number]) => st.groupId !== null && st.groupId !== undefined)
      .filter((st: (typeof classRecord.students)[number]): st is (typeof classRecord.students)[number] => {
        return teacherIds.every((tid) => {
          const g = gradeByStudentTeacher.get(`${st.id}:${tid}`)
          return typeof g === 'number'
        })
      })

    // Build Noten entries: only matched students and only those with a provided note
    const noten = completeStudents
      .map((st: typeof completeStudents[number]): { Matrikelnummer: number; Note: number; Punkte: number; Kommentar: string } | null => {
        const note = notesByStudentId.get(st.id)
        if (!note) return null
        const key = `${normalizeNamePart(classRecord.name)}|${normalizeNamePart(st.lastName)}|${normalizeNamePart(st.firstName)}`
        const matrikelnummer = nmIndex.get(key) ?? null
        if (!matrikelnummer) return null // IMPORTANT: do not POST unmatched users
        return {
          Matrikelnummer: matrikelnummer,
          Note: note,
          Punkte: 0.0,
          Kommentar: '',
        }
      })
      .filter(
        (
          n: { Matrikelnummer: number; Note: number; Punkte: number; Kommentar: string } | null
        ): n is { Matrikelnummer: number; Note: number; Punkte: number; Kommentar: string } => n !== null
      )

    if (noten.length === 0) {
      return NextResponse.json(
        { error: 'No matched students with notes to transfer' },
        { status: 400 }
      )
    }

    // Check for existing transfer
    const existingTransfer = await prisma.notenmanagementTransfer.findUnique({
      where: {
        classId_semester: {
          classId,
          semester,
        },
      },
    })

    const semesterLabel = semester === 'first' ? '1. Semester' : '2. Semester'
    const typ = semester === 'first' ? 'Semesternote' : 'Jahresnote'
    const payload = {
      LF: {
        Datum: toLfDate(new Date()),
        Klasse: classRecord.name,
        Fach: subjectTruncated,
        Typ: typ,
        MaxPunkte: 0.0,
        Kommentar: `Übertrag aus Wechselplan APP, ${semesterLabel}`,
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
        return NextResponse.json(
          { error: 'Notenmanagement /api/LFs PUT failed', details: putBody },
          { status: 502 }
        )
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
        return NextResponse.json(
          { error: 'Notenmanagement /api/LFs POST failed', details: postBody },
          { status: 502 }
        )
      }

      const lfId =
        typeof postBody === 'object' && postBody !== null
          ? (postBody as Record<string, unknown>).LF_ID ??
            (postBody as Record<string, unknown>).Lf_ID ??
            (postBody as Record<string, unknown>).id ??
            (postBody as Record<string, unknown>).Id
          : null

      if (typeof lfId !== 'number' && typeof lfId !== 'string') {
        return NextResponse.json(
          { error: 'LF created but no LF_ID returned', response: postBody },
          { status: 502 }
        )
      }

      lfIdStr = String(lfId)
    }

    // Upsert transfer record
    await prisma.notenmanagementTransfer.upsert({
      where: {
        classId_semester: {
          classId,
          semester,
        },
      },
      update: {
        lfId: lfIdStr,
      },
      create: {
        classId,
        semester,
        lfId: lfIdStr,
      },
    })
    const getUrl = new URL(`api/LFs/${encodeURIComponent(lfIdStr)}/Noten?sort=Nachname|Vorname`, env.NOTENMANAGEMENT_BASE_URL).toString()
    const getRes = await fetch(getUrl, {
      headers: { Authorization: `bearer ${accessToken}` },
    })
    const confirmation = getRes.ok ? await getRes.json() : null

    return NextResponse.json({
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
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Transfer failed' }, { status: 500 })
  }
}


