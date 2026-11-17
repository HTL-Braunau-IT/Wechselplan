import { NextResponse } from 'next/server'
import { captureError } from '@/lib/sentry'
import { prisma } from '@/lib/prisma'
import { resolveSessionTeacher } from '@/lib/session-teacher'
import { requireAccess } from '@/lib/api-guard'
import { resolveSchoolYearId } from '@/lib/school-year'
import { gradeGroupDay } from '@/lib/weekday-groups'
import { teachingDaysFor } from '@/lib/teaching-days'

/**
 * GET: Returns array of { date, period, turn } for which the current teacher has this class+group.
 * Uses TeacherRotation + schedule turns/weeks; excludes holidays.
 */
export async function GET(request: Request) {
  const gate = await requireAccess('staff')
  if (!gate.ok) return gate.response

  try {
    const session = gate.session
    if (!session?.user?.name) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const { searchParams } = new URL(request.url)
    const classIdParam = searchParams.get('classId')
    const groupIdParam = searchParams.get('groupId')
    const schoolYearIdParam = searchParams.get('schoolYearId')

    if (!classIdParam || !groupIdParam) {
      return NextResponse.json({ error: 'classId and groupId required' }, { status: 400 })
    }
    const classId = parseInt(classIdParam, 10)
    const groupId = parseInt(groupIdParam, 10)
    if (Number.isNaN(classId) || Number.isNaN(groupId)) {
      return NextResponse.json({ error: 'Invalid classId or groupId' }, { status: 400 })
    }

    const schoolYearId = await resolveSchoolYearId(schoolYearIdParam)
    if (schoolYearId == null) {
      return NextResponse.json({ error: 'No school year found.' }, { status: 400 })
    }

    const teacher = await resolveSessionTeacher(session)
    if (!teacher) {
      return NextResponse.json({ error: 'Teacher not found' }, { status: 403 })
    }

    const isAssignedToClass = await prisma.teacherAssignment.findFirst({
      where: { teacherId: teacher.id, classId, schoolYearId },
    })
    if (!isAssignedToClass) {
      return NextResponse.json({ error: 'Not assigned to this class' }, { status: 403 })
    }

    // Each weekday is its own plan with its own rotation and groups: the dates
    // come from the chosen day's plan only. Unscoped, a teacher on two days got
    // both days' rotations laid over whichever plan was created last.
    const groupDay = await gradeGroupDay({
      classId,
      schoolYearId,
      teacherId: teacher.id,
      weekday: searchParams.get('weekday'),
    })
    const teachingDays = await teachingDaysFor({
      teacherId: teacher.id,
      classId,
      groupId,
      schoolYearId,
      weekday: groupDay?.weekday ?? null,
    })

    return NextResponse.json({ teachingDays })
  } catch (error) {
    captureError(error, {
      location: 'api/noten/teaching-days',
      type: 'fetch-teaching-days',
    })
    return NextResponse.json({ error: 'Failed to fetch teaching days' }, { status: 500 })
  }
}
