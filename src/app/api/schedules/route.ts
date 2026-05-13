import { z } from 'zod'
import { captureError } from '~/lib/sentry'
import { prisma } from '@/lib/prisma'
import { parseJsonToNormalized, createScheduleTurnData } from '@/lib/schedule-data-helpers'
import { badRequest, created, notFound, ok, serverError, unprocessable } from '@/lib/api-response'

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
  semesterPlanning: z.enum(['first', 'second']).nullable().optional(),
  pmBiweeklyAnchor: z.enum(['A_ON_ODD_WEEKS', 'A_ON_EVEN_WEEKS']).nullable().optional()
})

/**
 * Handles HTTP POST requests to create or replace a schedule for a class on a specific weekday.
 *
 * Validates the request body, deletes any existing schedules for the specified class and weekday, and creates a new schedule with the provided details.
 *
 * @returns A JSON response containing the newly created schedule, or an error response with details if validation fails.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json()
    
    // Validate the request body against the schema
    const validationResult = scheduleSchema.safeParse(body)
    if (!validationResult.success) {
      return unprocessable('Invalid request data', validationResult.error.format())
    }

    const { name, description, startDate, endDate, selectedWeekday, scheduleData, classId, schoolYearId: bodySchoolYearId, additionalInfo, semesterPlanning, pmBiweeklyAnchor } = validationResult.data

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
      return badRequest('No school year found. Create a school year in Admin / Data / School Years first.')
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
      // Snapshot TeacherRotation before deleting turns: cascade would remove them and
      // /api/schedules/data would 404 until rotation is re-saved. Relink by turn name / order after new turns exist.
      type RotationSnap = {
        groupId: number
        teacherId: number
        period: 'AM' | 'PM'
        schoolYearId: number
        selectedWeekday: number
        turnName: string
        turnOrder: number
      }
      let rotationSnapshots: RotationSnap[] = []
      if (existingSchedule.classId != null) {
        const existingRotations = await prisma.teacherRotation.findMany({
          where: {
            classId: existingSchedule.classId,
            schoolYearId,
            selectedWeekday,
            turn: { scheduleId: existingSchedule.id }
          },
          include: {
            turn: { select: { name: true, order: true } }
          }
        })
        rotationSnapshots = existingRotations.map((r) => ({
          groupId: r.groupId,
          teacherId: r.teacherId,
          period: r.period as 'AM' | 'PM',
          schoolYearId: r.schoolYearId,
          selectedWeekday: r.selectedWeekday,
          turnName: r.turn.name,
          turnOrder: r.turn.order
        }))
      }

      // Delete existing turns (cascade will delete weeks, holidays, and TeacherRotation on old turn ids)
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
          additionalInfo,
          semesterPlanning,
          pmBiweeklyAnchor: pmBiweeklyAnchor ?? null,
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

      // Recreate rotations pointing at new ScheduleTurn ids (same class/year/weekday; match by turn name, else order).
      // If the new schedule has fewer turns or renamed turns, unmapped snapshots are skipped.
      if (rotationSnapshots.length > 0 && newSchedule.turns?.length) {
        const nameToTurnId = new Map(newSchedule.turns.map((t) => [t.name, t.id]))
        const orderToTurnId = new Map(newSchedule.turns.map((t) => [t.order, t.id]))
        const classId = existingSchedule.classId
        if (classId != null) {
          const rotationCreates = rotationSnapshots
            .map((snap) => {
              const newTurnId = nameToTurnId.get(snap.turnName) ?? orderToTurnId.get(snap.turnOrder)
              if (newTurnId == null) return null
              return {
                classId,
                groupId: snap.groupId,
                teacherId: snap.teacherId,
                period: snap.period,
                schoolYearId: snap.schoolYearId,
                selectedWeekday: snap.selectedWeekday,
                turnId: newTurnId
              }
            })
            .filter((row): row is NonNullable<typeof row> => row != null)
          if (rotationCreates.length > 0) {
            await prisma.teacherRotation.createMany({ data: rotationCreates })
          }
        }
      }
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
          additionalInfo,
          semesterPlanning,
          pmBiweeklyAnchor: pmBiweeklyAnchor ?? null,
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

    return created(newSchedule)
  } catch (error) {
    captureError(error, {
      location: 'api/schedules',
      type: 'create-schedule'
    })
    return serverError('Failed to create schedule')
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
      return badRequest('Class ID is required')
    }

    const classRecord = await prisma.class.findFirst({
      where: {
        name: className
      }
    })

    if (!classRecord) {
      return notFound(`Class '${className}' not found`)
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
      return notFound('No schedules found')
    }

    return ok(schedules)
  } catch (error) {
    captureError(error, {
      location: 'api/schedules',
      type: 'fetch-schedules'
    })
    return serverError('Failed to fetch schedules')
  }
} 