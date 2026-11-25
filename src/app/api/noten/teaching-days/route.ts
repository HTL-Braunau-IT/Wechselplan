import { NextResponse } from 'next/server'
import { captureError } from '@/lib/sentry'
import { resolveSessionTeacher } from '@/lib/session-teacher'
import { requireAccess } from '@/lib/api-guard'
import { resolveSchoolYearId } from '@/lib/school-year'
import { gradeGroupDay } from '@/lib/weekday-groups'
import { teachingDaysFor } from '@/lib/teaching-days'
import {
  distinctHalfDays,
  parseWeekday,
  recordedHalfDays,
  resolveNotenAccess,
} from '@/lib/noten-access'

/**
 * GET: Returns array of { date, period, turn } for which the current teacher has this class+group.
 * Uses TeacherRotation + schedule turns/weeks; excludes holidays. A teacher who is no longer
 * on the plan gets the half-days they recorded marks on instead (see src/lib/noten-access.ts).
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

    const access = await resolveNotenAccess({
      teacherId: teacher.id,
      classId,
      schoolYearId,
      weekday: searchParams.get('weekday'),
    })
    if (!access) {
      return NextResponse.json({ error: 'Not assigned to this class' }, { status: 403 })
    }

    // Taken off the plan: there is no rotation left to derive the dates from, so
    // the half-days are the ones the teacher recorded something on.
    if (access === 'former') {
      const recorded = await recordedHalfDays({
        teacherId: teacher.id,
        classId,
        schoolYearId,
        groupId,
        weekday: parseWeekday(searchParams.get('weekday')),
      })
      return NextResponse.json({ teachingDays: distinctHalfDays(recorded) })
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
    if (teachingDays.length === 0) {
      // Still on the plan but no longer rotating through this group (moved to
      // other groups, or the rotation was rebuilt without them): fall back to the
      // half-days they recorded for it on this weekday, so those marks stay visible.
      const recorded = await recordedHalfDays({
        teacherId: teacher.id,
        classId,
        schoolYearId,
        groupId,
        weekday: groupDay?.weekday ?? null,
      })
      return NextResponse.json({ teachingDays: distinctHalfDays(recorded) })
    }

    return NextResponse.json({ teachingDays })
  } catch (error) {
    captureError(error, {
      location: 'api/noten/teaching-days',
      type: 'fetch-teaching-days',
    })
    return NextResponse.json({ error: 'Failed to fetch teaching days' }, { status: 500 })
  }
}
