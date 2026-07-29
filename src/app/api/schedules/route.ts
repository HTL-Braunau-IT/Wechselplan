import { NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { captureError } from '@/lib/sentry'
import { prisma } from '@/lib/prisma'
import { parseJsonToNormalized, createScheduleTurnData, normalizeToJsonFormat } from '@/lib/schedule-data-helpers'
import { denyUnlessAccess } from '@/lib/api-guard'

const scheduleSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  startDate: z.string().refine((date) => !isNaN(Date.parse(date)), {
    message: 'Invalid start date format'
  }),
  endDate: z.string().refine((date) => !isNaN(Date.parse(date)), {
    message: 'Invalid end date format'
  }),
  selectedWeekday: z.number().int().min(0).max(6),
  scheduleData: z.any(), // Using any for now since the exact structure isn't clear
  classId: z.string().optional(),
  schoolYearId: z.number().int().positive().optional(),
  additionalInfo: z.any().optional(),
  semesterPlanning: z.enum(['first', 'second']).nullable().optional()
})

/**
 * Handles HTTP POST requests to create or replace a schedule for a class on a specific weekday.
 *
 * Validates the request body, deletes any existing schedules for the specified class and weekday, and creates a new schedule with the provided details.
 *
 * @returns A JSON response containing the newly created schedule, or an error response with details if validation fails.
 */
export async function POST(req: Request) {
  const denied = await denyUnlessAccess('staff')
  if (denied) return denied

  try {
    const body = await req.json()
    
    // Validate the request body against the schema
    const validationResult = scheduleSchema.safeParse(body)
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid request data', details: validationResult.error.format() },
        { status: 400 }
      )
    }

    const { name, description, startDate, endDate, selectedWeekday, scheduleData, classId, schoolYearId: bodySchoolYearId, additionalInfo, semesterPlanning } = validationResult.data

    // Resolve school year: from body or current
    let schoolYearId = bodySchoolYearId
    if (schoolYearId == null) {
      const now = new Date()
      const current = await prisma.schoolYear.findFirst({
        where: { startDate: { lte: now }, endDate: { gte: now } },
        select: { id: true }
      })
      schoolYearId = current?.id ?? (await prisma.schoolYear.findFirst({ orderBy: { startDate: 'desc' }, select: { id: true } }))?.id
    }
    if (schoolYearId == null) {
      return NextResponse.json(
        { error: 'No school year found. Create a school year in Admin / Data / School Years first.' },
        { status: 400 }
      )
    }

    // Find existing schedule for this class, weekday, and school year
    const existingSchedule = await prisma.schedule.findFirst({
      where: {
        classId: classId ? parseInt(classId) : null,
        selectedWeekday,
        schoolYearId
      },
      include: {
        scheduleTimes: true,
        breakTimes: true
      }
    })

    let newSchedule
    if (existingSchedule) {
      // Delete existing turns (cascade will delete weeks and holidays)
      await prisma.scheduleTurn.deleteMany({
        where: { scheduleId: existingSchedule.id }
      })

      // Update existing schedule, preserving times
      newSchedule = await prisma.schedule.update({
        where: { id: existingSchedule.id },
        data: {
          name,
          description,
          startDate: new Date(startDate),
          endDate: new Date(endDate),
          schoolYearId,
          scheduleData: Prisma.JsonNull, // No longer storing JSON - using normalized turns instead
          additionalInfo,
          semesterPlanning,
          // Create normalized turns if scheduleData is provided
          ...(scheduleData ? {
            turns: {
              create: parseJsonToNormalized(scheduleData).map((turnData, order) =>
                createScheduleTurnData(turnData, order)
              )
            }
          } : {})
        },
        include: {
          scheduleTimes: true,
          breakTimes: true,
          turns: {
            include: {
              weeks: true,
              holidays: {
                include: {
                  holiday: true
                }
              }
            },
            orderBy: {
              order: 'asc'
            }
          }
        }
      })
    } else {
      // Create new schedule
      newSchedule = await prisma.schedule.create({
        data: {
          name,
          description,
          startDate: new Date(startDate),
          endDate: new Date(endDate),
          selectedWeekday,
          schoolYearId,
          classId: classId ? parseInt(classId) : null,
          scheduleData: Prisma.JsonNull, // No longer storing JSON - using normalized turns instead
          additionalInfo,
          semesterPlanning,
          // Create normalized turns if scheduleData is provided
          ...(scheduleData ? {
            turns: {
              create: parseJsonToNormalized(scheduleData).map((turnData, order) =>
                createScheduleTurnData(turnData, order)
              )
            }
          } : {})
        },
        include: {
          scheduleTimes: true,
          breakTimes: true,
          turns: {
            include: {
              weeks: true,
              holidays: {
                include: {
                  holiday: true
                }
              }
            },
            orderBy: {
              order: 'asc'
            }
          }
        }
      })
    }

    return NextResponse.json(newSchedule)
  } catch (error) {
    captureError(error, {
      location: 'api/schedules',
      type: 'create-schedule'
    })
    return new NextResponse('Internal Error', { status: 500 })
  }
}

/**
 * Retrieves schedules for a class, optionally filtered by weekday.
 *
 * Looks up the class by name from the `classId` query parameter, then returns schedules for that class, optionally filtered by the `weekday` query parameter. Results are ordered by creation date descending.
 *
 * @returns A JSON response containing the list of matching schedules, or an error message with appropriate HTTP status if not found or on error.
 */
export async function GET(req: Request) {
  const denied = await denyUnlessAccess('session')
  if (denied) return denied

  try {
    const { searchParams } = new URL(req.url)
    const className = searchParams.get('classId')
    const weekday = searchParams.get('weekday')
    const schoolYearIdParam = searchParams.get('schoolYearId')
    let schoolYearId: number | undefined = schoolYearIdParam ? parseInt(schoolYearIdParam, 10) : undefined
    if (schoolYearId == null || Number.isNaN(schoolYearId)) {
      const now = new Date()
      const current = await prisma.schoolYear.findFirst({
        where: { startDate: { lte: now }, endDate: { gte: now } },
        select: { id: true }
      })
      schoolYearId = current?.id ?? (await prisma.schoolYear.findFirst({ orderBy: { startDate: 'desc' }, select: { id: true } }))?.id
    }

    if (!className) {
      return NextResponse.json({ error: 'Class ID is required' }, { status: 400 })
    }

    const classRecord = await prisma.class.findFirst({
      where: {
        name: className
      }
    })

    if (!classRecord) {
      return NextResponse.json({ error: `Class '${className}' not found` }, { status: 404 })
    }

    const schedules = await prisma.schedule.findMany({
      where: {
        classId: classRecord.id,
        ...(schoolYearId != null ? { schoolYearId } : {}),
        ...(weekday ? { selectedWeekday: parseInt(weekday) } : {})
      },
      include: {
        turns: {
          include: {
            weeks: true,
            holidays: {
              include: {
                holiday: true
              }
            }
          },
          orderBy: {
            order: 'asc'
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    if (schedules.length === 0) {
      captureError(new Error('No schedules found for classId ' + classRecord.id), {
        location: 'api/schedules',
        type: 'fetch-schedules'
      })
      return NextResponse.json({ error: 'No schedules found' }, { status: 404 })
    }

    // Convert normalized turns back to scheduleData JSON format for backward compatibility
    const schedulesWithData = schedules.map(schedule => ({
      ...schedule,
      scheduleData: schedule.turns && schedule.turns.length > 0
        ? normalizeToJsonFormat(schedule.turns)
        : null
    }))

    return NextResponse.json(schedulesWithData)
  } catch (error) {
    captureError(error, {
      location: 'api/schedules',
      type: 'fetch-schedules'
    })
    return new NextResponse('Internal Error', { status: 500 })
  }
} 