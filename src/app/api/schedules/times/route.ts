import { NextResponse } from 'next/server'
import { captureError } from '@/lib/sentry'
import { prisma } from '@/lib/prisma'
import { badRequest, notFound, ok, serverError } from '@/lib/api-response'

/**
 * Handles HTTP OPTIONS requests for the schedule times API route.
 *
 * Returns a 204 No Content response with an 'Allow' header specifying the permitted HTTP methods.
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Allow': 'GET, POST, OPTIONS',
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
  const { searchParams } = new URL(request.url)
  const classIdParam = searchParams.get('classId')
  const schoolYearIdParam = searchParams.get('schoolYearId')
  const weekdayParam = searchParams.get('weekday')

  if (!classIdParam) {
    return badRequest('Class ID is required')
  }

  const classId = parseInt(classIdParam, 10)
  if (isNaN(classId)) {
    return badRequest('Class ID must be a number')
  }

  let schoolYearId: number | undefined = schoolYearIdParam ? parseInt(schoolYearIdParam, 10) : undefined
  if (schoolYearId == null || Number.isNaN(schoolYearId)) {
    const now = new Date()
    const current = await prisma.schoolYear.findFirst({
      where: { startDate: { lte: now }, endDate: { gte: now } },
      select: { id: true }
    })
    schoolYearId = current?.id ?? (await prisma.schoolYear.findFirst({ orderBy: { startDate: 'desc' }, select: { id: true } }))?.id
  }

  const weekday =
    weekdayParam != null && weekdayParam !== ''
      ? parseInt(weekdayParam, 10)
      : undefined

  const times = await prisma.schedule.findFirst({
    where: {
      classId: classId,
      ...(schoolYearId != null ? { schoolYearId } : {}),
      ...(weekday != null && !Number.isNaN(weekday) ? { selectedWeekday: weekday } : {})
    },
    orderBy: {
      createdAt: 'desc'
    },
    include: {
      scheduleTimes: true,
      breakTimes: true
    }
  })

  if (!times) {
    return notFound('No schedule times found for this class')
  }

  return ok({ times })
}


/**
 * Updates the latest schedule for a class with new schedule and break times.
 *
 * Expects a JSON body containing `scheduleTimes`, `breakTimes`, and `classId`. Validates the presence of `classId`, retrieves the latest schedule for the specified class, and updates its associated times. Returns the updated schedule in JSON format, or an error response if validation fails, the class or schedule is not found, or an internal error occurs.
 */
export async function POST(request: Request) {
  try {
    const { scheduleTimes, breakTimes, classId, schoolYearId: bodySchoolYearId, weekday: bodyWeekday } = await request.json() as {
      scheduleTimes: Array<{ id: number }>
      breakTimes: Array<{ id: number }>
      classId: number
      schoolYearId?: number
      weekday?: number
    }

    if (!classId || typeof classId !== 'number') {
      return badRequest('Class ID is required')
    }

    let schoolYearId = bodySchoolYearId
    if (schoolYearId == null) {
      const now = new Date()
      const current = await prisma.schoolYear.findFirst({
        where: { startDate: { lte: now }, endDate: { gte: now } },
        select: { id: true }
      })
      schoolYearId = current?.id ?? (await prisma.schoolYear.findFirst({ orderBy: { startDate: 'desc' }, select: { id: true } }))?.id
    }

    const weekdayFilter =
      typeof bodyWeekday === 'number' && bodyWeekday >= 1 && bodyWeekday <= 5 ? bodyWeekday : undefined

    const latestSchedule = await prisma.schedule.findFirst({
      where: {
        classId: classId,
        ...(schoolYearId != null ? { schoolYearId } : {}),
        ...(weekdayFilter != null ? { selectedWeekday: weekdayFilter } : {})
      },
      orderBy: {
        createdAt: 'desc'
      },
      include: {
        scheduleTimes: true,
        breakTimes: true
      }
    })

    if (!latestSchedule) {
      return notFound('No schedule found for this class')
    }

    // Update the schedule with the selected times
    const updatedSchedule = await prisma.schedule.update({
      where: {
        id: latestSchedule.id
      },
      data: {
        scheduleTimes: {
          set: scheduleTimes.map((time: { id: number }) => ({ id: time.id }))
        },
        breakTimes: {
          set: breakTimes.map((time: { id: number }) => ({ id: time.id }))
        }
      },
      include: {
        scheduleTimes: true,
        breakTimes: true
      }
    })

    return ok(updatedSchedule)
  } catch (error) {
    
    captureError(error, {
      location: 'api/schedules/times',
      type: 'save-times'
    })
    return serverError('Failed to save times')
  }
}

