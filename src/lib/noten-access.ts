import { prisma } from '@/lib/prisma'
import { resolveMemberClassIds } from '@/lib/combined-classes'
import { toLocalDateString } from '@/lib/date-utils'

/**
 * Who may open a class on the Noten screen.
 *
 * A TeacherAssignment is what puts a class on a teacher's grading screen. But
 * assignments are replaced wholesale when a plan is re-saved, so a teacher taken
 * off a plan lost sight of every mark they had recorded for it — the NotenEntry
 * rows survive (they are keyed to the teacher, not the assignment) and simply
 * became unreachable. A teacher therefore keeps *read* access to whatever they
 * recorded:
 *
 * - `assigned` — on the plan: the normal, editable screen.
 * - `former`   — no longer on the plan (for that weekday) but holding recorded
 *                entries: the screen is rebuilt from those entries, view-only.
 *
 * Write routes deliberately still require a TeacherAssignment.
 */
export type NotenAccess = 'assigned' | 'former'

/** A NotenEntry that actually holds something (not a row left empty by a cleared mark). */
const HAS_CONTENT = {
  OR: [
    { attendance: { not: null } },
    { wiederholung1: { not: null } },
    { wiederholung2: { not: null } },
    { bericht1: { not: null } },
    { bericht2: { not: null } },
    { mitarbeit1: { not: null } },
    { mitarbeit2: { not: null } },
    { praktischeArbeit1: { not: null } },
    { praktischeArbeit2: { not: null } },
    { notizen: { not: null } },
  ],
}

/**
 * The weekday (0–6, as `selectedWeekday`) of an entry's date. Local time, like
 * `toLocalDateString` — the date string every Noten route keys entries by.
 */
export function entryWeekday(date: Date): number {
  return date.getDay()
}

/** A raw `weekday` query/body value as an integer, or null when absent/invalid. */
export function parseWeekday(raw: string | number | null | undefined): number | null {
  if (raw == null || raw === '') return null
  const n = Number(raw)
  return Number.isInteger(n) ? n : null
}

export interface RecordedHalfDay {
  studentId: number
  groupId: number
  date: Date
  period: string
}

/**
 * The half-days a teacher recorded something on for a class (expanded to its
 * member classes when combined — entries are filed under the real class),
 * optionally narrowed to one group and/or one weekday.
 */
export async function recordedHalfDays(params: {
  teacherId: number
  classId: number
  schoolYearId: number
  groupId?: number | null
  weekday?: number | null
}): Promise<RecordedHalfDay[]> {
  const classIds = await resolveMemberClassIds(params.classId)
  const rows = await prisma.notenEntry.findMany({
    where: {
      teacherId: params.teacherId,
      classId: { in: classIds },
      schoolYearId: params.schoolYearId,
      ...(params.groupId != null ? { groupId: params.groupId } : {}),
      ...HAS_CONTENT,
    },
    select: { studentId: true, groupId: true, date: true, period: true },
  })
  return params.weekday == null
    ? rows
    : rows.filter(row => entryWeekday(row.date) === params.weekday)
}

/**
 * Everything a teacher recorded in a school year, one row per (class, group,
 * date) — what the class list is extended with for plans they were taken off.
 */
export async function recordedClassDays(params: { teacherId: number; schoolYearId: number }) {
  return prisma.notenEntry.findMany({
    where: { teacherId: params.teacherId, schoolYearId: params.schoolYearId, ...HAS_CONTENT },
    distinct: ['classId', 'groupId', 'date'],
    select: { classId: true, groupId: true, date: true },
  })
}

/**
 * The teacher's access to a class on the Noten screen, or null for none.
 *
 * With a `weekday`, the question is asked of that day's plan: a teacher still on
 * the class's Thursday plan but taken off its Monday plan is `former` on Monday.
 * A day they neither teach nor recorded anything on keeps the class-level answer,
 * as before.
 */
export async function resolveNotenAccess(params: {
  teacherId: number
  classId: number
  schoolYearId: number
  weekday?: string | number | null
}): Promise<NotenAccess | null> {
  const { teacherId, classId, schoolYearId } = params
  const weekday = parseWeekday(params.weekday)

  const onPlan = await prisma.teacherAssignment.findFirst({
    where: {
      teacherId,
      classId,
      schoolYearId,
      ...(weekday != null ? { selectedWeekday: weekday } : {}),
    },
    select: { id: true },
  })
  if (onPlan) return 'assigned'

  const recorded = await recordedHalfDays({ teacherId, classId, schoolYearId, weekday })
  if (recorded.length > 0) return 'former'
  if (weekday == null) return null

  const onAnotherDay = await prisma.teacherAssignment.findFirst({
    where: { teacherId, classId, schoolYearId },
    select: { id: true },
  })
  return onAnotherDay ? 'assigned' : null
}

/** Sorted, de-duplicated `{ date, period }` half-days (AM before PM), dates as YYYY-MM-DD. */
export function distinctHalfDays(rows: Array<{ date: Date; period: string }>) {
  const seen = new Map<string, { date: string; period: string }>()
  for (const row of rows) {
    const date = toLocalDateString(row.date)
    seen.set(`${date}-${row.period}`, { date, period: row.period })
  }
  return [...seen.values()].sort(
    (a, b) => a.date.localeCompare(b.date) || a.period.localeCompare(b.period),
  )
}
