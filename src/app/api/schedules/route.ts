import { NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { captureError } from '@/lib/sentry'
import { prisma } from '@/lib/prisma'
import {
  parseJsonToNormalized,
  createScheduleTurnData,
  normalizeToJsonFormat,
} from '@/lib/schedule-data-helpers'
import { denyUnlessAccess, requireAccess } from '@/lib/api-guard'
import { resolveCurrentTeacher } from '@/lib/current-teacher'
import { notifyScheduleChange } from './_notify'

const scheduleSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  startDate: z.string().refine(date => !isNaN(Date.parse(date)), {
    message: 'Invalid start date format',
  }),
  endDate: z.string().refine(date => !isNaN(Date.parse(date)), {
    message: 'Invalid end date format',
  }),
  selectedWeekday: z.number().int().min(0).max(6),
  // Per-period lanes. Each carries its own Turnus structure (`*ScheduleData`, the
  // TurnSchedule blob the normalizer understands) and its own cadence. `scheduleData`
  // is the legacy single blob — treated as the AM lane when the split ones are absent.
  amEnabled: z.boolean().optional(),
  pmEnabled: z.boolean().optional(),
  amWeekInterval: z.number().int().min(1).max(4).optional(),
  amWeekOffset: z.number().int().min(0).max(3).optional(),
  pmWeekInterval: z.number().int().min(1).max(4).optional(),
  pmWeekOffset: z.number().int().min(0).max(3).optional(),
  amScheduleData: z.any().optional(),
  pmScheduleData: z.any().optional(),
  scheduleData: z.any().optional(),
  classId: z.string().optional(),
  schoolYearId: z.number().int().positive().optional(),
  additionalInfo: z.any().optional(),
  semesterPlanning: z.enum(['first', 'second']).nullable().optional(),
})

/**
 * Handles HTTP POST requests to create or replace a schedule for a class on a specific weekday.
 *
 * Validates the request body, deletes any existing schedules for the specified class and weekday, and creates a new schedule with the provided details.
 *
 * @returns A JSON response containing the newly created schedule, or an error response with details if validation fails.
 */
export async function POST(req: Request) {
  const gate = await requireAccess('staff')
  if (!gate.ok) return gate.response

  try {
    const body = await req.json()

    // Validate the request body against the schema
    const validationResult = scheduleSchema.safeParse(body)
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid request data', details: validationResult.error.format() },
        { status: 400 },
      )
    }

    const {
      name,
      description,
      startDate,
      endDate,
      selectedWeekday,
      amEnabled,
      pmEnabled,
      amWeekInterval,
      amWeekOffset,
      pmWeekInterval,
      pmWeekOffset,
      amScheduleData,
      pmScheduleData,
      scheduleData,
      classId,
      schoolYearId: bodySchoolYearId,
      additionalInfo,
      semesterPlanning,
    } = validationResult.data

    // The legacy single blob feeds the AM lane when the split ones are absent.
    const amBlob = amScheduleData ?? scheduleData ?? null
    const pmBlob = pmScheduleData ?? null
    const amOn = amEnabled ?? Boolean(amBlob)
    const pmOn = pmEnabled ?? Boolean(pmBlob)

    // One flat list of nested-turn creates, each tagged with its period lane.
    const turnCreates = [
      ...(amOn
        ? parseJsonToNormalized(amBlob).map((turn, order) =>
            createScheduleTurnData(turn, order, 'AM'),
          )
        : []),
      ...(pmOn
        ? parseJsonToNormalized(pmBlob).map((turn, order) =>
            createScheduleTurnData(turn, order, 'PM'),
          )
        : []),
    ]

    const periodConfig = {
      amEnabled: amOn,
      pmEnabled: pmOn,
      amWeekInterval: amWeekInterval ?? 1,
      amWeekOffset: amWeekOffset ?? 0,
      pmWeekInterval: pmWeekInterval ?? 1,
      pmWeekOffset: pmWeekOffset ?? 0,
    }

    // Turn replacement is per-lane. A metadata-only save (the "Tag & Perioden"
    // step) sends no turn blobs and must not wipe Turnusse saved later; a save
    // that carries only one lane's blob must not wipe the other lane.
    const hasAmTurnInput = amScheduleData !== undefined || scheduleData !== undefined
    const hasPmTurnInput = pmScheduleData !== undefined

    // Resolve school year: from body or current
    let schoolYearId = bodySchoolYearId
    if (schoolYearId == null) {
      const now = new Date()
      const current = await prisma.schoolYear.findFirst({
        where: { startDate: { lte: now }, endDate: { gte: now } },
        select: { id: true },
      })
      schoolYearId =
        current?.id ??
        (
          await prisma.schoolYear.findFirst({
            orderBy: { startDate: 'desc' },
            select: { id: true },
          })
        )?.id
    }
    if (schoolYearId == null) {
      return NextResponse.json(
        {
          error: 'No school year found. Create a school year in Admin / Data / School Years first.',
        },
        { status: 400 },
      )
    }

    // Find existing schedule for this class, weekday, and school year
    const existingSchedule = await prisma.schedule.findFirst({
      where: {
        classId: classId ? parseInt(classId) : null,
        selectedWeekday,
        schoolYearId,
      },
      include: {
        scheduleTimes: true,
        breakTimes: true,
      },
    })

    const session = gate.session
    const author = await resolveCurrentTeacher(session)

    let newSchedule
    if (existingSchedule) {
      // Clear only the lanes whose turns were sent (to be recreated below), plus
      // any lane just switched off so a disabled period leaves nothing behind.
      const periodsToClear = [
        hasAmTurnInput || !amOn ? 'AM' : null,
        hasPmTurnInput || !pmOn ? 'PM' : null,
      ].filter((p): p is string => p !== null)
      if (periodsToClear.length > 0) {
        await prisma.scheduleTurn.deleteMany({
          where: { scheduleId: existingSchedule.id, period: { in: periodsToClear } },
        })
      }

      // Update existing schedule, preserving times
      newSchedule = await prisma.schedule.update({
        where: { id: existingSchedule.id },
        data: {
          name,
          description,
          startDate: new Date(startDate),
          endDate: new Date(endDate),
          schoolYearId,
          ...periodConfig,
          scheduleData: Prisma.JsonNull, // No longer storing JSON - using normalized turns instead
          additionalInfo,
          semesterPlanning,
          // Plans predating the author column get one on their next save, so
          // the person who built them still hears about later edits.
          createdById: existingSchedule.createdById ?? author?.id ?? null,
          ...(turnCreates.length > 0 ? { turns: { create: turnCreates } } : {}),
        },
        include: {
          scheduleTimes: true,
          breakTimes: true,
          turns: {
            include: {
              weeks: true,
              holidays: {
                include: {
                  holiday: true,
                },
              },
            },
            orderBy: [{ period: 'asc' }, { order: 'asc' }],
          },
        },
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
          ...periodConfig,
          scheduleData: Prisma.JsonNull, // No longer storing JSON - using normalized turns instead
          additionalInfo,
          semesterPlanning,
          createdById: author?.id ?? null,
          ...(turnCreates.length > 0 ? { turns: { create: turnCreates } } : {}),
        },
        include: {
          scheduleTimes: true,
          breakTimes: true,
          turns: {
            include: {
              weeks: true,
              holidays: {
                include: {
                  holiday: true,
                },
              },
            },
            orderBy: [{ period: 'asc' }, { order: 'asc' }],
          },
        },
      })
    }

    if (newSchedule.classId != null) {
      await notifyScheduleChange({
        type: existingSchedule ? 'schedule-updated' : 'schedule-created',
        classId: newSchedule.classId,
        schoolYearId,
        actor: author,
        session,
      })
    }

    return NextResponse.json(newSchedule)
  } catch (error) {
    captureError(error, {
      location: 'api/schedules',
      type: 'create-schedule',
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
    let schoolYearId: number | undefined = schoolYearIdParam
      ? parseInt(schoolYearIdParam, 10)
      : undefined
    if (schoolYearId == null || Number.isNaN(schoolYearId)) {
      const now = new Date()
      const current = await prisma.schoolYear.findFirst({
        where: { startDate: { lte: now }, endDate: { gte: now } },
        select: { id: true },
      })
      schoolYearId =
        current?.id ??
        (
          await prisma.schoolYear.findFirst({
            orderBy: { startDate: 'desc' },
            select: { id: true },
          })
        )?.id
    }

    if (!className) {
      return NextResponse.json({ error: 'Class ID is required' }, { status: 400 })
    }

    const classRecord = await prisma.class.findFirst({
      where: {
        name: className,
      },
    })

    if (!classRecord) {
      return NextResponse.json({ error: `Class '${className}' not found` }, { status: 404 })
    }

    const schedules = await prisma.schedule.findMany({
      where: {
        classId: classRecord.id,
        ...(schoolYearId != null ? { schoolYearId } : {}),
        ...(weekday ? { selectedWeekday: parseInt(weekday) } : {}),
      },
      include: {
        turns: {
          include: {
            weeks: true,
            holidays: {
              include: {
                holiday: true,
              },
            },
          },
          orderBy: [{ period: 'asc' }, { order: 'asc' }],
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    if (schedules.length === 0) {
      captureError(new Error('No schedules found for classId ' + classRecord.id), {
        location: 'api/schedules',
        type: 'fetch-schedules',
      })
      return NextResponse.json({ error: 'No schedules found' }, { status: 404 })
    }

    // Split the normalized turns back into per-lane TurnSchedule blobs. `scheduleData`
    // keeps its legacy meaning (the AM lane) for older readers; `amScheduleData` /
    // `pmScheduleData` carry each lane explicitly.
    const schedulesWithData = schedules.map(schedule => {
      const amTurns = schedule.turns?.filter(turn => turn.period === 'AM') ?? []
      const pmTurns = schedule.turns?.filter(turn => turn.period === 'PM') ?? []
      const amData = amTurns.length > 0 ? normalizeToJsonFormat(amTurns) : null
      const pmData = pmTurns.length > 0 ? normalizeToJsonFormat(pmTurns) : null
      return {
        ...schedule,
        amScheduleData: amData,
        pmScheduleData: pmData,
        scheduleData: amData,
      }
    })

    return NextResponse.json(schedulesWithData)
  } catch (error) {
    captureError(error, {
      location: 'api/schedules',
      type: 'fetch-schedules',
    })
    return new NextResponse('Internal Error', { status: 500 })
  }
}
