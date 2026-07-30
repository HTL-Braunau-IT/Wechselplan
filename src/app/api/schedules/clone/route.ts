import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { Prisma } from '@prisma/client'

import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { captureError } from '@/lib/sentry'
import { denyUnlessAccess } from '@/lib/api-guard'
import { resolveCurrentTeacher } from '@/lib/current-teacher'
import { resolveSchoolYearId } from '@/lib/school-year'
import { createScheduleTurnData } from '@/lib/schedule-data-helpers'
import type { ScheduleTurnData } from '@/lib/schedule-data-helpers'
import { notifyScheduleChange } from '../_notify'

interface CloneRequest {
  classId: number
  fromWeekday: number
  toWeekday: number
  schoolYearId?: number
  /** Replace the target day's plan if one already exists. */
  overwrite?: boolean
}

/**
 * Clone a class's plan from one weekday onto another (same school year).
 *
 * Each weekday is its own plan — the same subject taught on two days usually has
 * different teachers and can even have a different number of Turnusse — so this
 * copies the source day as an editable starting point rather than sharing config:
 * the Schedule (both AM/PM lanes + cadence), the teacher assignments and the
 * rotation are duplicated onto the target weekday. Student groups are class-wide,
 * so they are already shared and are not touched here.
 */
export async function POST(request: Request) {
  const denied = await denyUnlessAccess('staff')
  if (denied) return denied

  try {
    const body = (await request.json()) as CloneRequest
    const { classId, fromWeekday, toWeekday, overwrite } = body

    if (
      typeof classId !== 'number' ||
      typeof fromWeekday !== 'number' ||
      typeof toWeekday !== 'number'
    ) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    if (fromWeekday === toWeekday) {
      return NextResponse.json({ error: 'SAME_WEEKDAY' }, { status: 400 })
    }

    const schoolYearId = body.schoolYearId ?? (await resolveSchoolYearId())
    if (schoolYearId == null) {
      return NextResponse.json({ error: 'No school year found.' }, { status: 400 })
    }

    const source = await prisma.schedule.findFirst({
      where: { classId, selectedWeekday: fromWeekday, schoolYearId },
      include: {
        scheduleTimes: { select: { id: true } },
        breakTimes: { select: { id: true } },
        turns: {
          include: { weeks: true, holidays: { include: { holiday: true } } },
          orderBy: [{ period: 'asc' }, { order: 'asc' }],
        },
      },
    })
    if (!source) {
      return NextResponse.json({ error: 'SOURCE_NOT_FOUND' }, { status: 404 })
    }

    const existingTarget = await prisma.schedule.findFirst({
      where: { classId, selectedWeekday: toWeekday, schoolYearId },
      select: { id: true, createdById: true },
    })
    if (existingTarget && !overwrite) {
      return NextResponse.json({ error: 'TARGET_EXISTS' }, { status: 409 })
    }

    const session = await getServerSession(authOptions)
    const author = await resolveCurrentTeacher(session)

    // Rebuild the nested turn creates for both lanes from the source turns.
    const turnCreates = source.turns.map((turn, index) => {
      const perLaneOrder = source.turns
        .filter(t => t.period === turn.period)
        .findIndex(t => t.id === turn.id)
      const data: ScheduleTurnData = {
        name: turn.name,
        customLength: turn.customLength,
        weeks: turn.weeks.map(w => ({ date: w.date, week: w.week, isHoliday: w.isHoliday })),
        holidayIds: turn.holidays.map(h => h.holiday.id),
      }
      return createScheduleTurnData(
        data,
        perLaneOrder >= 0 ? perLaneOrder : index,
        turn.period as 'AM' | 'PM',
      )
    })

    const scheduleData = {
      name: source.name,
      description: source.description,
      startDate: source.startDate,
      endDate: source.endDate,
      selectedWeekday: toWeekday,
      schoolYearId,
      classId,
      amEnabled: source.amEnabled,
      pmEnabled: source.pmEnabled,
      amWeekInterval: source.amWeekInterval,
      amWeekOffset: source.amWeekOffset,
      pmWeekInterval: source.pmWeekInterval,
      pmWeekOffset: source.pmWeekOffset,
      scheduleData: Prisma.JsonNull,
      additionalInfo: source.additionalInfo,
      semesterPlanning: source.semesterPlanning,
      // Copy the times relations (they are shared reference rows).
      scheduleTimes: { connect: source.scheduleTimes.map(t => ({ id: t.id })) },
      breakTimes: { connect: source.breakTimes.map(t => ({ id: t.id })) },
      turns: turnCreates.length > 0 ? { create: turnCreates } : undefined,
    }

    await prisma.$transaction(async tx => {
      if (existingTarget) {
        await tx.scheduleTurn.deleteMany({ where: { scheduleId: existingTarget.id } })
        await tx.schedule.update({
          where: { id: existingTarget.id },
          data: {
            ...scheduleData,
            createdById: existingTarget.createdById ?? author?.id ?? null,
          },
        })
      } else {
        await tx.schedule.create({
          data: { ...scheduleData, createdById: author?.id ?? null },
        })
      }

      // Teacher assignments: copy the source weekday's rows onto the target.
      await tx.teacherAssignment.deleteMany({
        where: { classId, schoolYearId, selectedWeekday: toWeekday },
      })
      const sourceAssignments = await tx.teacherAssignment.findMany({
        where: { classId, schoolYearId, selectedWeekday: fromWeekday },
      })
      if (sourceAssignments.length > 0) {
        await tx.teacherAssignment.createMany({
          data: sourceAssignments.map(a => ({
            classId: a.classId,
            period: a.period,
            groupId: a.groupId,
            teacherId: a.teacherId,
            subjectId: a.subjectId,
            learningContentId: a.learningContentId,
            roomId: a.roomId,
            selectedWeekday: toWeekday,
            schoolYearId,
          })),
        })
      }

      // Rotation: copy the source weekday's rows onto the target.
      await tx.teacherRotation.deleteMany({
        where: { classId, schoolYearId, selectedWeekday: toWeekday },
      })
      const sourceRotation = await tx.teacherRotation.findMany({
        where: { classId, schoolYearId, selectedWeekday: fromWeekday },
      })
      if (sourceRotation.length > 0) {
        await tx.teacherRotation.createMany({
          data: sourceRotation.map(r => ({
            classId: r.classId,
            groupId: r.groupId,
            teacherId: r.teacherId,
            turnId: r.turnId,
            period: r.period,
            selectedWeekday: toWeekday,
            schoolYearId,
          })),
        })
      }
    })

    await notifyScheduleChange({
      type: existingTarget ? 'schedule-updated' : 'schedule-created',
      classId,
      schoolYearId,
      actor: author,
      session,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    captureError(error, { location: 'api/schedules/clone', type: 'clone-schedule' })
    return NextResponse.json({ error: 'Failed to clone schedule' }, { status: 500 })
  }
}
