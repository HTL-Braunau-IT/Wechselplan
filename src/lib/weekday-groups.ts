import { prisma } from '@/lib/prisma'

/**
 * Per-weekday group membership (StudentWeekdayGroup).
 *
 * Each weekday is its own plan, and a class may be split into different groups on
 * each day. Readers keep their existing `{ groupId }` student shape and call
 * {@link overlayWeekdayGroups} to swap in the chosen day's grouping, so client
 * code does not need to know groups became per-day. Student.groupId is only the
 * fallback for a class with no stored per-day rows (e.g. no plan yet).
 */

export interface PlanDay {
  /** The class the plan belongs to (a combined class's own id, not a member's). */
  classId: number
  schoolYearId: number
  weekday: number
}

/** studentId → groupId for one weekday's plan. Empty when that day has no rows. */
export async function weekdayGroupMap(day: PlanDay): Promise<Map<number, number>> {
  const rows = await prisma.studentWeekdayGroup.findMany({
    where: {
      classId: day.classId,
      schoolYearId: day.schoolYearId,
      selectedWeekday: day.weekday,
    },
    select: { studentId: true, groupId: true },
  })
  return new Map(rows.map(r => [r.studentId, r.groupId]))
}

/**
 * Replaces each student's `groupId` with their group on `day`.
 *
 * When the day has stored rows they are authoritative: a student missing from
 * them is unassigned (null) on that day. Without any rows (a class planned before
 * per-day groups, or not planned at all) the students are returned unchanged.
 */
export function applyWeekdayGroups<T extends { id: number; groupId: number | null }>(
  students: T[],
  groups: Map<number, number>,
): T[] {
  if (groups.size === 0) return students
  return students.map(s => ({ ...s, groupId: groups.get(s.id) ?? null }))
}

/** {@link weekdayGroupMap} + {@link applyWeekdayGroups}; a null day is a no-op. */
export async function overlayWeekdayGroups<T extends { id: number; groupId: number | null }>(
  students: T[],
  day: PlanDay | null,
): Promise<T[]> {
  if (!day) return students
  return applyWeekdayGroups(students, await weekdayGroupMap(day))
}

/**
 * The weekday whose grouping a grade screen should use for a class.
 *
 * Grade screens have no weekday of their own, so the group is the one on the day
 * the teacher actually teaches the class (their TeacherAssignment). An explicit
 * `weekday` wins; a teacher teaching the class on several days gets the earliest
 * unless they pick another; without a teacher match, the class's earliest planned
 * day is used. Null when the class has no plan in that year.
 */
export async function resolveGroupWeekday(params: {
  classId: number
  schoolYearId: number
  teacherId?: number | null
  weekday?: number | null
}): Promise<number | null> {
  const { classId, schoolYearId, teacherId, weekday } = params
  if (weekday != null && Number.isInteger(weekday)) return weekday

  if (teacherId != null) {
    const own = await prisma.teacherAssignment.findFirst({
      where: { classId, schoolYearId, teacherId },
      orderBy: { selectedWeekday: 'asc' },
      select: { selectedWeekday: true },
    })
    if (own) return own.selectedWeekday
  }

  const plan = await prisma.schedule.findFirst({
    where: { classId, schoolYearId },
    orderBy: { selectedWeekday: 'asc' },
    select: { selectedWeekday: true },
  })
  return plan?.selectedWeekday ?? null
}

/** The weekdays a teacher teaches a class on, ascending (for a day switch). */
export async function teacherWeekdaysForClass(params: {
  classId: number
  schoolYearId: number
  teacherId: number
}): Promise<number[]> {
  const rows = await prisma.teacherAssignment.findMany({
    where: params,
    distinct: ['selectedWeekday'],
    orderBy: { selectedWeekday: 'asc' },
    select: { selectedWeekday: true },
  })
  return rows.map(r => r.selectedWeekday)
}

type Tx = Pick<typeof prisma, 'studentWeekdayGroup' | 'combinedClassMember'>

/**
 * The plans a student in `classId` belongs to: the class itself plus every
 * combined class spanning it (whose plans group that class's students too).
 */
export async function planClassIdsFor(tx: Tx, classId: number): Promise<number[]> {
  const combined = await tx.combinedClassMember.findMany({
    where: { memberClassId: classId },
    select: { combinedClassId: true },
  })
  return [classId, ...combined.map(m => m.combinedClassId)]
}

/**
 * Drops a student's per-day groups in every plan outside their (new) class. A
 * group number means nothing in another class, so a moved student lands in the
 * destination's "unassigned" bucket for each day, like Student.groupId does.
 */
export async function dropGroupsOutsideClass(
  tx: Tx,
  studentId: number,
  classId: number,
): Promise<number[]> {
  const keep = await planClassIdsFor(tx, classId)
  await tx.studentWeekdayGroup.deleteMany({
    where: { studentId, classId: { notIn: keep } },
  })
  return keep
}

/**
 * A synchronous weekday → group lookup for one student, for callers that walk
 * many dates (the student's "next workshop day" search). Rows of the student's
 * own class win over rows of a combined class spanning it. A student with no
 * per-day rows at all keeps Student.groupId on every day.
 */
export async function studentGroupByWeekday(params: {
  studentId: number
  classId: number
  schoolYearId: number
  fallback: number | null
}): Promise<(weekday: number) => number | null> {
  const rows = await prisma.studentWeekdayGroup.findMany({
    where: { studentId: params.studentId, schoolYearId: params.schoolYearId },
    select: { classId: true, selectedWeekday: true, groupId: true },
  })
  if (rows.length === 0) return () => params.fallback
  const byDay = new Map<number, number>()
  for (const r of rows) {
    if (r.classId === params.classId || !byDay.has(r.selectedWeekday)) {
      byDay.set(r.selectedWeekday, r.groupId)
    }
  }
  return weekday => byDay.get(weekday) ?? null
}

/**
 * The plan day whose grouping a grade screen uses for `classId` — see
 * {@link resolveGroupWeekday}. Accepts the raw `weekday` query value so routes
 * can pass `searchParams.get('weekday')` straight through.
 */
export async function gradeGroupDay(params: {
  classId: number
  schoolYearId: number
  teacherId?: number | null
  weekday?: string | number | null
}): Promise<PlanDay | null> {
  const raw = params.weekday
  const parsed = raw == null || raw === '' ? null : Number(raw)
  const weekday = await resolveGroupWeekday({
    classId: params.classId,
    schoolYearId: params.schoolYearId,
    teacherId: params.teacherId,
    weekday: parsed != null && Number.isInteger(parsed) ? parsed : null,
  })
  return weekday == null
    ? null
    : { classId: params.classId, schoolYearId: params.schoolYearId, weekday }
}

/**
 * The weekday a per-day group setting (Noten group weights, seat plan) belongs
 * to: the requested day, else the teacher's own day for the class. A class
 * without any plan has class-wide groups only, so its settings live on Monday.
 */
export async function groupSettingsWeekday(params: {
  classId: number
  schoolYearId: number
  teacherId: number
  weekday?: string | number | null
}): Promise<number> {
  return (await gradeGroupDay(params))?.weekday ?? 1
}
