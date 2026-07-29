import { NextResponse } from 'next/server'
import { captureError } from '@/lib/sentry'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isFeatureEnabled } from '@/lib/entitlements'
import { normalizeUsername } from '@/lib/username'
import { denyUnlessAccess } from '@/lib/api-guard'

/**
 * POST: Set Anwesenheit for all students in the group for the given day to "Anwesend".
 * Body: { classId, groupId, schoolYearId, date, period }
 */
export async function POST(request: Request) {
  const denied = await denyUnlessAccess('staff')
  if (denied) return denied

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

    const body = await request.json()
    const { classId, groupId, schoolYearId, date, period } = body as {
      classId?: number
      groupId?: number
      schoolYearId?: number
      date?: string
      period?: string
    }

    if (classId == null || groupId == null || schoolYearId == null || !date || !period) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    if (period !== 'AM' && period !== 'PM') {
      return NextResponse.json({ error: 'period must be AM or PM' }, { status: 400 })
    }
    // Require a strict YYYY-MM-DD string and round-trip it so overflow dates
    // like 2025-02-31 (which Date silently rolls into March) are rejected
    // rather than persisted under the wrong @db.Date.
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: 'Invalid date' }, { status: 400 })
    }
    // Anchor at UTC midnight, exactly as the per-cell entries route does. Using
    // local midnight here shifted the @db.Date to the previous day on servers
    // ahead of UTC (e.g. Austria), so "Alle anwesend" landed on the wrong day.
    const dateOnly = new Date(date + 'T00:00:00.000Z')
    if (Number.isNaN(dateOnly.getTime()) || dateOnly.toISOString().slice(0, 10) !== date) {
      return NextResponse.json({ error: 'Invalid date' }, { status: 400 })
    }

    const username = normalizeUsername(session.user.name)
    const teacher = await prisma.teacher.findUnique({ where: { username } })
    if (!teacher) {
      return NextResponse.json({ error: 'Teacher not found' }, { status: 403 })
    }

    const isAssignedToClass = await prisma.teacherAssignment.findFirst({
      where: { teacherId: teacher.id, classId, schoolYearId },
    })
    if (!isAssignedToClass) {
      return NextResponse.json({ error: 'Not assigned to this class' }, { status: 403 })
    }

    const membershipIds = await prisma.classMembership.findMany({
      where: { classId, schoolYearId },
      select: { studentId: true },
    })
    const studentIds = membershipIds.map(m => m.studentId)
    const studentsInGroup = await prisma.student.findMany({
      where: { id: { in: studentIds }, groupId },
      select: { id: true },
    })

    // One transaction so a mid-loop failure doesn't leave the day half-marked.
    await prisma.$transaction(
      studentsInGroup.map(s =>
        prisma.notenEntry.upsert({
          where: {
            studentId_teacherId_classId_groupId_schoolYearId_date_period: {
              studentId: s.id,
              teacherId: teacher.id,
              classId,
              groupId,
              schoolYearId,
              date: dateOnly,
              period,
            },
          },
          create: {
            studentId: s.id,
            teacherId: teacher.id,
            classId,
            groupId,
            schoolYearId,
            date: dateOnly,
            period,
            attendance: 'Anwesend',
          },
          update: { attendance: 'Anwesend' },
        }),
      ),
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    captureError(error, {
      location: 'api/noten/set-attendance-day',
      type: 'set-attendance-day',
    })
    return NextResponse.json({ error: 'Failed to set attendance' }, { status: 500 })
  }
}
