import { NextResponse } from 'next/server'
import { captureError } from '@/lib/sentry'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isFeatureEnabled } from '@/lib/entitlements'
import { normalizeUsername } from '@/lib/username'
import { denyUnlessAccess } from '@/lib/api-guard'

/**
 * PATCH: Upsert Lehrstoff for a single day (teacher, class, group, date, period).
 */
export async function PATCH(request: Request) {
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
    const { classId, groupId, schoolYearId, date, period, lehrstoff } = body as {
      classId?: number
      groupId?: number
      schoolYearId?: number
      date?: string
      period?: string
      lehrstoff?: string
    }

    if (classId == null || groupId == null || schoolYearId == null || !date || !period) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    if (period !== 'AM' && period !== 'PM') {
      return NextResponse.json({ error: 'period must be AM or PM' }, { status: 400 })
    }
    const dateOnly = new Date(date + 'T00:00:00.000Z')
    if (Number.isNaN(dateOnly.getTime())) {
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

    await prisma.lehrstoffPerDay.upsert({
      where: {
        teacherId_classId_groupId_schoolYearId_date_period: {
          teacherId: teacher.id,
          classId,
          groupId,
          schoolYearId,
          date: dateOnly,
          period,
        },
      },
      create: {
        teacherId: teacher.id,
        classId,
        groupId,
        schoolYearId,
        date: dateOnly,
        period,
        lehrstoff: lehrstoff ?? null,
      },
      update: { lehrstoff: lehrstoff ?? null },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    captureError(error, {
      location: 'api/noten/lehrstoff',
      type: 'save-lehrstoff',
    })
    return NextResponse.json({ error: 'Failed to save Lehrstoff' }, { status: 500 })
  }
}
