// Data access for the Raumplan feature: pulls the school-year's assignments,
// rotations, rooms and per-class schedules from Prisma, then hands plain rows to
// the pure resolvers in `resolve.ts`. Keeping the Prisma boundary here (not in
// the route handler) matches the repo convention — see CLAUDE.md.

import { prisma } from '@/lib/prisma'
import { studentGroupByWeekday } from '@/lib/weekday-groups'
import { levelOfRoom } from './levels'
import {
  PERIODS,
  WEEKDAYS,
  addDays,
  findInvariantViolations,
  formatPlanDate,
  isScheduledPlacement,
  isoWeekday,
  parsePlanDate,
  resolveRoomOccupancy,
  resolveStudentPlacement,
  resolveTurnusName,
  weekdayDates,
} from './resolve'
import type {
  AssignmentRow,
  InvariantViolation,
  Period,
  RoomCell,
  RotationRow,
  StudentPlacementPeriod,
  StudentPlacementResult,
  StudentSelfPlacement,
  TurnDates,
  WeekOccupancy,
} from './types'

const teacherName = (t: { firstName: string; lastName: string }) =>
  `${t.firstName} ${t.lastName}`.trim()

async function loadAssignments(schoolYearId: number): Promise<AssignmentRow[]> {
  const rows = await prisma.teacherAssignment.findMany({
    where: { schoolYearId },
    include: {
      teacher: { select: { firstName: true, lastName: true } },
      room: { select: { name: true } },
      subject: { select: { name: true } },
      learningContent: { select: { name: true } },
      class: { select: { name: true } },
    },
  })

  return rows.map(a => ({
    classId: a.classId,
    className: a.class.name,
    groupId: a.groupId ?? null,
    teacherId: a.teacherId,
    teacherName: teacherName(a.teacher),
    roomId: a.roomId,
    roomName: a.room.name,
    subjectName: a.subject.name,
    learningContentName: a.learningContent.name,
    period: a.period as Period,
    selectedWeekday: a.selectedWeekday,
  }))
}

async function loadRotations(schoolYearId: number): Promise<RotationRow[]> {
  const rows = await prisma.teacherRotation.findMany({ where: { schoolYearId } })
  return rows.map(r => ({
    classId: r.classId,
    groupId: r.groupId ?? null,
    teacherId: r.teacherId,
    // turnId is a turn *label* string (matches ScheduleTurn.name), not an FK.
    turnName: r.turnId,
    period: r.period as Period,
    selectedWeekday: r.selectedWeekday,
  }))
}

/** Per-class, per-weekday turn dates. Latest schedule wins for a (class, weekday)
 * pair, mirroring `schedule.findFirst({ orderBy: { createdAt: 'desc' } })`. */
async function loadClassTurns(
  classIds: number[],
  schoolYearId: number,
): Promise<Map<number, Map<number, TurnDates[]>>> {
  if (classIds.length === 0) return new Map()

  const schedules = await prisma.schedule.findMany({
    where: { classId: { in: classIds }, schoolYearId },
    orderBy: { createdAt: 'asc' }, // asc so later rows overwrite earlier → latest wins
    include: {
      turns: { include: { weeks: { select: { date: true } } } },
    },
  })

  const byClass = new Map<number, Map<number, TurnDates[]>>()
  for (const s of schedules) {
    if (s.classId == null) continue
    const perWeekday = byClass.get(s.classId) ?? new Map<number, TurnDates[]>()
    perWeekday.set(
      s.selectedWeekday,
      s.turns.map(t => ({
        period: t.period as Period,
        turnName: t.name,
        dates: t.weeks.map(w => w.date),
      })),
    )
    byClass.set(s.classId, perWeekday)
  }
  return byClass
}

async function loadRooms(): Promise<{ name: string; level: string | null }[]> {
  const rooms = await prisma.room.findMany({ select: { name: true }, orderBy: { name: 'asc' } })
  return rooms.map(r => ({ name: r.name, level: levelOfRoom(r.name) }))
}

/**
 * Full week occupancy grid. `reference` is any date in the target week ("dd.MM.yy",
 * defaults to today); occupancy is resolved for Mon–Fr × AM/PM. Both the Grundriss
 * and Matrix views are derived client-side by filtering these cells.
 */
export async function getWeekOccupancy(
  reference: string | null,
  schoolYearId: number,
): Promise<WeekOccupancy> {
  const refDate = (reference ? parsePlanDate(reference) : null) ?? new Date()
  const weekDates = weekdayDates(refDate)

  const [assignments, rotations, rooms] = await Promise.all([
    loadAssignments(schoolYearId),
    loadRotations(schoolYearId),
    loadRooms(),
  ])

  const classIds = [...new Set(assignments.map(a => a.classId))]
  const classTurns = await loadClassTurns(classIds, schoolYearId)

  const cells: RoomCell[] = []
  for (const weekday of WEEKDAYS) {
    const date = weekDates[weekday]!
    for (const period of PERIODS) {
      const turnusByClass: Record<number, string | null> = {}
      for (const classId of classIds) {
        const turns = classTurns.get(classId)?.get(weekday) ?? []
        turnusByClass[classId] = resolveTurnusName(turns, period, date)
      }
      cells.push(
        ...resolveRoomOccupancy(rooms, assignments, rotations, turnusByClass, weekday, period),
      )
    }
  }

  return { schoolYearId, reference: formatPlanDate(refDate), weekDates, cells }
}

/** "Where should I be?" for one student on a date ("dd.MM.yy", defaults today). */
export async function getStudentPlacement(
  studentId: number,
  date: string | null,
  schoolYearId: number,
): Promise<StudentPlacementResult | null> {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      classId: true,
      groupId: true,
      class: { select: { name: true } },
    },
  })
  if (student?.classId == null) return null

  const target = (date ? parsePlanDate(date) : null) ?? new Date()
  const dateStr = formatPlanDate(target)
  const weekday = isoWeekday(target)

  const [assignments, rotations, classTurnsMap] = await Promise.all([
    loadAssignments(schoolYearId),
    loadRotations(schoolYearId),
    loadClassTurns([student.classId], schoolYearId),
  ])

  const classTurns = classTurnsMap.get(student.classId)?.get(weekday) ?? []
  // Groups are per weekday — the student's group on the requested day.
  const groupOn = await studentGroupByWeekday({
    studentId: student.id,
    classId: student.classId,
    schoolYearId,
    fallback: student.groupId ?? null,
  })
  const groupId = groupOn(weekday)

  const periods = resolveStudentPlacement(
    { classId: student.classId, groupId },
    assignments,
    rotations,
    classTurns,
    dateStr,
    weekday,
    levelOfRoom,
  )

  return {
    student: {
      id: student.id,
      name: `${student.firstName} ${student.lastName}`.trim(),
      className: student.class?.name ?? null,
      groupId,
    },
    date: dateStr,
    weekday,
    periods,
  }
}

export interface StudentLike {
  id: number
  firstName: string
  lastName: string
  classId: number
  groupId: number | null
  className: string | null
}

/**
 * The signed-in student's own room for today, or — when today is not a workshop
 * day for them — the next scheduled day within `searchDays`. The route resolves
 * the `Student` from the session (see resolveSessionStudent) and passes it here,
 * so a student only ever gets their own data.
 */
export async function getStudentSelfPlacement(
  student: StudentLike,
  fromDate: string | null,
  schoolYearId: number,
  searchDays = 28,
): Promise<StudentSelfPlacement> {
  const from = (fromDate ? parsePlanDate(fromDate) : null) ?? new Date()

  const [assignments, rotations, classTurnsMap, groupOn] = await Promise.all([
    loadAssignments(schoolYearId),
    loadRotations(schoolYearId),
    loadClassTurns([student.classId], schoolYearId),
    studentGroupByWeekday({
      studentId: student.id,
      classId: student.classId,
      schoolYearId,
      fallback: student.groupId ?? null,
    }),
  ])

  // The reported group is the one on the day being shown (groups are per weekday).
  const summaryOn = (date: Date) => ({
    id: student.id,
    name: `${student.firstName} ${student.lastName}`.trim(),
    className: student.className,
    groupId: groupOn(isoWeekday(date)),
  })

  const placeOn = (date: Date): StudentPlacementPeriod[] => {
    const weekday = isoWeekday(date)
    const turns = classTurnsMap.get(student.classId)?.get(weekday) ?? []
    return resolveStudentPlacement(
      { classId: student.classId, groupId: groupOn(weekday) },
      assignments,
      rotations,
      turns,
      formatPlanDate(date),
      weekday,
      levelOfRoom,
    )
  }

  for (let d = 0; d < searchDays; d++) {
    const date = addDays(from, d)
    const weekday = isoWeekday(date)
    if (weekday > 5) continue
    const periods = placeOn(date)
    if (isScheduledPlacement(periods)) {
      return {
        student: summaryOn(date),
        date: formatPlanDate(date),
        weekday,
        isToday: d === 0,
        hasUpcoming: true,
        periods,
      }
    }
  }

  // Nothing found in the window — report today (all empty) so the UI can say so.
  return {
    student: summaryOn(from),
    date: formatPlanDate(from),
    weekday: isoWeekday(from),
    isToday: true,
    hasUpcoming: false,
    periods: placeOn(from),
  }
}

/** Invariant self-check (build step 1): any (teacher, weekday, period) mapping to
 * more than one room this school year. Empty array = invariant holds. */
export async function getInvariantViolations(schoolYearId: number): Promise<InvariantViolation[]> {
  const assignments = await loadAssignments(schoolYearId)
  return findInvariantViolations(assignments)
}
