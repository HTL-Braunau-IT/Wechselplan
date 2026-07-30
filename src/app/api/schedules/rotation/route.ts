import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { captureError } from '@/lib/sentry'
import { denyUnlessAccess } from '@/lib/api-guard'
import { resolveCurrentTeacher } from '@/lib/current-teacher'
import { resolveSchoolYearId } from '@/lib/school-year'
import { notifyScheduleChange } from '../_notify'

interface GroupRotationRow {
  groupId: number
  turns: (number | null)[]
}

interface TeacherRotationRequest {
  classId: number
  selectedWeekday: number
  schoolYearId?: number
  // Per-lane Turnus labels. `turns` is the legacy shared list, still accepted and
  // applied to both lanes when the split ones are absent.
  amTurns?: string[]
  pmTurns?: string[]
  turns?: string[]
  amRotation: GroupRotationRow[]
  pmRotation: GroupRotationRow[]
}

/**
 * Handles a POST request to update the teacher rotation schedule for a class.
 *
 * Replaces all existing teacher rotation records for the specified class with new AM and PM rotation data provided in the request body. Responds with a JSON object indicating success, or an error message with an appropriate HTTP status code if validation fails, the class is not found, or an internal error occurs.
 *
 * @returns A JSON response indicating success or providing an error message.
 */
export async function POST(request: Request) {
  const denied = await denyUnlessAccess('staff')
  if (denied) return denied

  try {
    const data = (await request.json()) as TeacherRotationRequest
    const { classId, amRotation, pmRotation } = data
    const amTurns = data.amTurns ?? data.turns ?? []
    const pmTurns = data.pmTurns ?? data.turns ?? []

    if (
      !classId ||
      typeof classId !== 'number' ||
      typeof data.selectedWeekday !== 'number' ||
      !amRotation ||
      !pmRotation
    ) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    if (amTurns.length === 0 && pmTurns.length === 0) {
      // Without any turn labels there is nothing to write — refuse rather than
      // silently wiping the weekday's rotation and returning success.
      return NextResponse.json({ error: 'Missing turn labels' }, { status: 400 })
    }
    const selectedWeekday = data.selectedWeekday

    const classData = await prisma.class.findUnique({
      where: {
        id: classId,
      },
    })

    if (!classData) {
      return NextResponse.json({ error: 'Class not found' }, { status: 404 })
    }

    // Rotation is scoped per weekday+year now (a class can hold a different plan
    // on each day), so resolve the year before touching any rows. A null year
    // would drop the constraint from the delete below and wipe every year, so
    // refuse it the same way POST /api/schedules and the clone route do.
    const schoolYearId = data.schoolYearId ?? (await resolveSchoolYearId())
    if (schoolYearId == null) {
      return NextResponse.json({ error: 'No school year found.' }, { status: 400 })
    }

    // Captured before the wipe below: a teacher dropped from this day's rotation
    // is exactly the person who most needs to hear that it changed.
    const previousTeachers = await prisma.teacherRotation.findMany({
      where: { classId: classData.id, selectedWeekday, schoolYearId },
      select: { teacherId: true },
      distinct: ['teacherId'],
    })

    // Delete only THIS day's (and year's) rotations — never the sibling weekdays.
    await prisma.teacherRotation.deleteMany({
      where: { classId: classData.id, selectedWeekday, schoolYearId },
    })

    const writePeriod = async (
      period: 'AM' | 'PM',
      rotationRows: GroupRotationRow[],
      turnLabels: string[],
    ) => {
      for (const groupRotation of rotationRows) {
        for (let i = 0; i < turnLabels.length; i++) {
          const teacherId = groupRotation.turns[i]
          if (teacherId != null) {
            await prisma.teacherRotation.create({
              data: {
                classId: classData.id,
                groupId: groupRotation.groupId,
                teacherId,
                turnId: turnLabels[i]!,
                period,
                selectedWeekday,
                schoolYearId,
              },
            })
          }
        }
      }
    }

    await writePeriod('AM', amRotation, amTurns)
    await writePeriod('PM', pmRotation, pmTurns)

    const session = await getServerSession(authOptions)
    await notifyScheduleChange({
      type: 'schedule-rotation-changed',
      classId: classData.id,
      schoolYearId,
      actor: await resolveCurrentTeacher(session),
      session,
      alsoNotify: previousTeachers.map(rotation => rotation.teacherId),
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    captureError(error, {
      location: 'api/schedules/rotation',
      type: 'update-rotation',
    })
    return NextResponse.json({ error: 'Failed to update teacher rotation' }, { status: 500 })
  }
}
