import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { captureError } from '@/lib/sentry'
import { prisma } from '@/lib/prisma'
import { denyUnlessAccess } from '@/lib/api-guard'
import { resolveCurrentTeacher } from '@/lib/current-teacher'
import { resolveSchoolYearId } from '@/lib/school-year'
import { notifyScheduleChange } from '../_notify'

/**
 * Handles HTTP OPTIONS requests for the schedule times API route.
 *
 * Returns a 204 No Content response with an 'Allow' header specifying the permitted HTTP methods.
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      Allow: 'GET, POST, OPTIONS',
    },
  })
}

/**
 * Retrieves the latest schedule times and break times for a class by ID.
 *
 * Expects a `classId` query parameter in the request URL. Returns a 400 error if `classId` is missing, or a 404 error if no schedule is found for the specified class.
 *
 * @returns A JSON response containing the latest schedule and break times for the class.
 */
export async function GET(request: Request) {
  const denied = await denyUnlessAccess('session')
  if (denied) return denied

  const { searchParams } = new URL(request.url)
  const classIdParam = searchParams.get('classId')

  if (!classIdParam) {
    return NextResponse.json({ error: 'Class ID is required' }, { status: 400 })
  }

  const classId = parseInt(classIdParam, 10)
  if (isNaN(classId)) {
    return NextResponse.json({ error: 'Class ID must be a number' }, { status: 400 })
  }

  // Get the latest schedule for this class
  const times = await prisma.schedule.findFirst({
    where: {
      classId: classId,
    },
    orderBy: {
      createdAt: 'desc',
    },
    include: {
      scheduleTimes: true,
      breakTimes: true,
    },
  })

  if (!times) {
    return NextResponse.json({ error: 'No schedule times found for this class' }, { status: 404 })
  }

  return NextResponse.json({ times })
}

/**
 * Updates the latest schedule for a class with new schedule and break times.
 *
 * Expects a JSON body containing `scheduleTimes`, `breakTimes`, and `classId`. Validates the presence of `classId`, retrieves the latest schedule for the specified class, and updates its associated times. Returns the updated schedule in JSON format, or an error response if validation fails, the class or schedule is not found, or an internal error occurs.
 */
export async function POST(request: Request) {
  const denied = await denyUnlessAccess('staff')
  if (denied) return denied

  try {
    const { scheduleTimes, breakTimes, classId } = await request.json()

    if (!classId || typeof classId !== 'number') {
      return NextResponse.json({ error: 'Class ID is required' }, { status: 400 })
    }

    // Get the latest schedule for this class
    const latestSchedule = await prisma.schedule.findFirst({
      where: {
        classId: classId,
      },
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        scheduleTimes: true,
        breakTimes: true,
      },
    })

    if (!latestSchedule) {
      return NextResponse.json({ error: 'No schedule found for this class' }, { status: 404 })
    }

    // Update the schedule with the selected times
    const updatedSchedule = await prisma.schedule.update({
      where: {
        id: latestSchedule.id,
      },
      data: {
        scheduleTimes: {
          set: scheduleTimes.map((time: { id: number }) => ({ id: time.id })),
        },
        breakTimes: {
          set: breakTimes.map((time: { id: number }) => ({ id: time.id })),
        },
      },
      include: {
        scheduleTimes: true,
        breakTimes: true,
      },
    })

    // Changing the times/breaks (and thus turn usage) of a class's plan is a
    // schedule edit like any other — tell everyone attached to the class. Folds
    // into the class's existing bell entry via the shared schedule dedupe key,
    // so a wizard run that also touches times stays one line, not two.
    const session = await getServerSession(authOptions)
    const actor = await resolveCurrentTeacher(session)
    const schoolYearId = await resolveSchoolYearId()
    if (schoolYearId != null) {
      await notifyScheduleChange({
        type: 'schedule-updated',
        classId,
        schoolYearId,
        actor,
        session,
      })
    }

    return NextResponse.json(updatedSchedule)
  } catch (error) {
    captureError(error, {
      location: 'api/schedules/times',
      type: 'save-times',
    })
    return NextResponse.json({ error: 'Failed to save times' }, { status: 500 })
  }
}
