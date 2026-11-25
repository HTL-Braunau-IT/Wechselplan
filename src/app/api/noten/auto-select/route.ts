import { NextResponse } from 'next/server'
import { captureError } from '@/lib/sentry'
import { prisma } from '@/lib/prisma'
import { resolveSessionTeacher } from '@/lib/session-teacher'
import { toLocalDateString } from '@/lib/date-utils'
import { requireAccess } from '@/lib/api-guard'
import { resolveSchoolYearId } from '@/lib/school-year'
import { resolvePlanSemester, semesterScope } from '@/lib/assignment-semester'
import {
  dateOfWeekdayInWeek,
  laneHasWeeks,
  laneTurns,
  parseYmd,
  turnAroundDate,
  turnOnDate,
} from '@/lib/current-turn'

/**
 * GET: Returns { classId, groupId } for the "current" slot based on server date/time, or null.
 * Uses TeacherRotation + schedule to find which class+group the teacher has today at current period.
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
    const schoolYearIdParam = searchParams.get('schoolYearId')
    const dateParam = searchParams.get('date')
    const periodParam = searchParams.get('period')
    const classIdParam = searchParams.get('classId')
    const now = new Date()
    const schoolYearId = await resolveSchoolYearId(schoolYearIdParam)
    if (schoolYearId == null) {
      return NextResponse.json({ classId: null, groupId: null })
    }

    const teacher = await resolveSessionTeacher(session)
    if (!teacher) {
      return NextResponse.json({ classId: null, groupId: null })
    }

    // Use client-provided date/period when given so timezone matches the user (e.g. noten page in Austria, server in UTC)
    const todayLocal =
      dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : toLocalDateString(now)
    const period =
      periodParam === 'AM' || periodParam === 'PM' ? periodParam : now.getHours() < 12 ? 'AM' : 'PM'
    const today = parseYmd(todayLocal) ?? now
    const currentWeekday = today.getDay()

    // Teachers can differ per semester: resolve against the set that applies on
    // the day in question, or a teacher in both halves has two base groups.
    const inSemester = semesterScope(
      await resolvePlanSemester(schoolYearId, new Date(todayLocal + 'T12:00:00')),
    )

    // When classId is provided: return groupId for that class's current turn (week-based), regardless of today's weekday
    const requestedClassId = classIdParam != null ? parseInt(classIdParam, 10) : NaN
    if (!Number.isNaN(requestedClassId)) {
      const allClassAssignments = await prisma.teacherAssignment.findMany({
        where: { teacherId: teacher.id, schoolYearId, classId: requestedClassId, ...inSemester },
        select: { classId: true, groupId: true, selectedWeekday: true, period: true },
        orderBy: { selectedWeekday: 'asc' },
      })
      if (allClassAssignments.length === 0) {
        return NextResponse.json({ classId: requestedClassId, groupId: null, weekday: null })
      }
      // Groups are per weekday: resolve on the requested day, else today when the
      // teacher teaches the class today, else their first day with it.
      const weekdayParam = Number(searchParams.get('weekday'))
      const teachingDays = new Set(allClassAssignments.map(a => a.selectedWeekday))
      const day =
        Number.isInteger(weekdayParam) && teachingDays.has(weekdayParam)
          ? weekdayParam
          : teachingDays.has(currentWeekday)
            ? currentWeekday
            : allClassAssignments[0]!.selectedWeekday
      const classAssignments = allClassAssignments.filter(a => a.selectedWeekday === day)
      const firstAssignment = classAssignments[0]
      if (!firstAssignment) {
        return NextResponse.json({ classId: requestedClassId, groupId: null, weekday: day })
      }
      const schedule = await prisma.schedule.findFirst({
        where: {
          classId: requestedClassId,
          schoolYearId,
          selectedWeekday: firstAssignment.selectedWeekday,
        },
        orderBy: { createdAt: 'desc' },
        include: {
          turns: { include: { weeks: true }, orderBy: { order: 'asc' } },
        },
      })
      // Scope by year AND weekday: turn labels ("TURNUS 1"…) repeat across every
      // weekday and year (#98 gives a class an independent rotation per weekday),
      // so an unscoped read/.find() can bind to the wrong weekday's group.
      const rotations = await prisma.teacherRotation.findMany({
        where: {
          teacherId: teacher.id,
          schoolYearId,
          selectedWeekday: firstAssignment.selectedWeekday,
        },
      })
      // Resolve the Turnus for this week's lesson on that day, not for today: on a
      // Tuesday, Friday's group is the one of this Friday. A lane that does not
      // meet this week (biweekly off-week, holiday) shows its next lesson's group.
      // The rotation's group is the answer as-is: the teacher's own assignment
      // rows only hold their starting group, so they must not veto it.
      const lane = laneTurns(schedule?.turns ?? [], firstAssignment.period)
      const turnName = turnAroundDate(lane, dateOfWeekdayInWeek(today, day))
      const rot = turnName
        ? rotations.find(
            r =>
              r.classId === requestedClassId &&
              r.period === firstAssignment.period &&
              r.turnId === turnName,
          )
        : undefined
      if (rot) {
        return NextResponse.json({ classId: requestedClassId, groupId: rot.groupId, weekday: day })
      }
      return NextResponse.json({
        classId: requestedClassId,
        groupId: firstAssignment.groupId,
        weekday: day,
      })
    }

    const assignments = await prisma.teacherAssignment.findMany({
      where: { teacherId: teacher.id, schoolYearId, ...inSemester },
      select: { classId: true, groupId: true, selectedWeekday: true, period: true },
    })
    // Scope by year AND the weekday being resolved so a class with independent
    // per-weekday rotations (#98) cannot bind to another weekday's group.
    const rotations = await prisma.teacherRotation.findMany({
      where: { teacherId: teacher.id, schoolYearId, selectedWeekday: currentWeekday },
    })

    const classIds = [...new Set(assignments.map(a => a.classId))]
    const schedules = await prisma.schedule.findMany({
      where: { classId: { in: classIds }, schoolYearId, selectedWeekday: currentWeekday },
      orderBy: { createdAt: 'desc' },
      include: {
        turns: { include: { weeks: true }, orderBy: { order: 'asc' } },
      },
    })
    const scheduleByClass = new Map<number, (typeof schedules)[0]>()
    for (const s of schedules) {
      if (s.classId && !scheduleByClass.has(s.classId)) scheduleByClass.set(s.classId, s)
    }

    // The class the teacher has right now: a lane counts only if it meets today
    // (a biweekly lane in its off-week does not), and its group is the rotation's
    // for the Turnus of today's lesson, in this period's lane only.
    if (currentWeekday >= 1 && currentWeekday <= 5) {
      const periodAssignments = assignments.filter(
        a => a.selectedWeekday === currentWeekday && a.period === period,
      )
      let withoutTurns: (typeof periodAssignments)[number] | undefined
      for (const a of periodAssignments) {
        const lane = laneTurns(scheduleByClass.get(a.classId)?.turns ?? [], period)
        if (!laneHasWeeks(lane)) {
          withoutTurns ??= a
          continue
        }
        const turnName = turnOnDate(lane, today)
        if (!turnName) continue
        const rot = rotations.find(
          r => r.classId === a.classId && r.period === period && r.turnId === turnName,
        )
        return NextResponse.json({
          classId: a.classId,
          groupId: rot?.groupId ?? a.groupId,
          weekday: currentWeekday,
        })
      }
      // Older schedules without dated turns: keep the assignment's own group.
      if (withoutTurns) {
        return NextResponse.json({
          classId: withoutTurns.classId,
          groupId: withoutTurns.groupId,
          weekday: currentWeekday,
        })
      }
    }

    return NextResponse.json({ classId: null, groupId: null, weekday: null })
  } catch (error) {
    captureError(error, {
      location: 'api/noten/auto-select',
      type: 'auto-select',
    })
    return NextResponse.json({ error: 'Failed to auto-select' }, { status: 500 })
  }
}
