import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { captureError } from '@/lib/sentry'
import { prisma } from '@/lib/prisma'
import { isFeatureEnabled } from '@/lib/entitlements'
import { UntisClient } from '@/server/untis/client'

interface AbsenceRequest {
  classId: number
  groupId: number
  date: string // ISO date string (YYYY-MM-DD)
}

/**
 * POST: Fetch absences from Untis API for a specific date and group
 * Filters to students in the specified group only
 */
export async function POST(request: Request) {
  let body: AbsenceRequest | undefined
  
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.name) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (session.user?.role !== 'teacher' && session.user?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (!(await isFeatureEnabled('noten'))) {
      return NextResponse.json({ error: 'Feature not available' }, { status: 403 })
    }

    body = (await request.json()) as AbsenceRequest

    console.log('[Untis API] Fetching absences request:', {
      classId: body.classId,
      groupId: body.groupId,
      date: body.date
    })

    // Validate request
    if (!body.classId || !body.groupId || !body.date) {
      return NextResponse.json(
        { error: 'Missing required fields: classId, groupId, date' },
        { status: 400 }
      )
    }

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.exec(body.date)) {
      return NextResponse.json(
        { error: 'Invalid date format. Expected YYYY-MM-DD' },
        { status: 400 }
      )
    }

    // Fetch class to ensure it exists
    const schoolClass = await prisma.class.findUnique({
      where: { id: body.classId },
    })

    if (!schoolClass) {
      return NextResponse.json({ error: 'Class not found' }, { status: 404 })
    }

    // Get students in the group
    const students = await prisma.student.findMany({
      where: {
        classId: body.classId,
        groupId: body.groupId,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
      },
    })

    if (students.length === 0) {
      // Return empty array if no students found - this is valid
      console.log('[Untis API] No students found in group, returning empty')
      return NextResponse.json({ absences: [], fetchedAt: new Date() })
    }

    console.log(`[Untis API] Found ${students.length} students in group, fetching from Untis...`)

    // Fetch absences from Untis
    let absences = await UntisClient.withSession(async (client) => {
      if (!body) throw new Error('Request body is missing')
      return await client.getAbsences(body.date)
    })

    // Filter absences to only students in the group
    const studentNames = new Set(
      students.map((s) => `${s.firstName} ${s.lastName}`.trim())
    )

    absences = absences.filter((absence) => studentNames.has(absence.studentName))

    console.log(`[Untis API] Received ${absences.length} absences from Untis for this group`)

    // Store absences in database for reference
    for (const absence of absences) {
      // Find matching student
      const student = students.find(
        (s) => `${s.firstName} ${s.lastName}`.trim() === absence.studentName
      )

      // Check if absence already exists
      const existing = await prisma.absence.findFirst({
        where: {
          untisId: absence.id,
          date: new Date(body.date),
        },
      })

      if (!existing) {
        await prisma.absence.create({
          data: {
            studentId: student?.id ?? undefined,
            studentName: absence.studentName,
            classId: body.classId,
            groupId: body.groupId,
            date: new Date(body.date),
            startTime: absence.startTime,
            endTime: absence.endTime,
            reason: absence.reason || undefined,
            reasonId: absence.reasonId || undefined,
            excuseStatus: absence.excuseStatus,
            text: absence.text || undefined,
            untisId: absence.id,
          },
        })
      }
    }

    console.log(`[Untis API] Stored ${absences.length} absences in database`)

    return NextResponse.json({
      absences,
      fetchedAt: new Date(),
      studentCount: students.length,
      absenceCount: absences.length,
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    const errorStack = error instanceof Error ? error.stack : undefined

    console.error('[Untis API] Error occurred:', {
      message: errorMessage,
      stack: errorStack,
      classId: body?.classId,
      groupId: body?.groupId,
      date: body?.date,
      error: error
    })

    captureError(error, {
      location: 'untis-absences',
      type: 'fetch-failure',
      extra: {
        classId: body?.classId,
        groupId: body?.groupId,
        date: body?.date,
      }
    })

    // Don't expose internal error details to client
    if (errorMessage.includes('Untis')) {
      return NextResponse.json(
        { error: 'Failed to fetch from Untis API', details: errorMessage },
        { status: 502 }
      )
    }

    return NextResponse.json(
      { error: 'Internal server error', details: errorMessage },
      { status: 500 }
    )
  }
}
