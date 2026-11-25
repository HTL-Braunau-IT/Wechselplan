/**
 * Server-side helpers for reading `TeacherAssignment` by semester.
 *
 * A weekday plan stores either whole-year rows (`semester = 'full'`) or a
 * `'first'` / `'second'` split. Any reader that wants ONE teacher set — a plan
 * table, an export, "who has this group today" — must scope its query with
 * {@link semesterScope}, or a split plan hands it both sets at once. Readers
 * that only ask "does this teacher teach this class" may stay unscoped.
 */
import { prisma } from '@/lib/prisma'
import { getCurrentSemesterFromSchoolYear } from '@/types/school-year'
import { isPlanSemester, type PlanSemester } from '@/lib/schedule-semester'

/** Prisma `where` fragment: the rows that apply during `semester`. */
export function semesterScope(semester: PlanSemester) {
  return { semester: { in: ['full', semester] } }
}

/** The semester change day of a school year, or null when the year is unknown. */
export async function getSemesterChangeDate(schoolYearId: number): Promise<Date | null> {
  const year = await prisma.schoolYear.findUnique({
    where: { id: schoolYearId },
    select: { semesterChangeDate: true },
  })
  return year?.semesterChangeDate ?? null
}

/** Which semester of the school year `at` falls in ('first' when the year is unknown). */
export async function resolvePlanSemester(
  schoolYearId: number,
  at: Date = new Date(),
): Promise<PlanSemester> {
  const change = await getSemesterChangeDate(schoolYearId)
  return change ? getCurrentSemesterFromSchoolYear(change.toISOString(), at) : 'first'
}

/** An explicit `semester` request value, else the semester `at` falls in. */
export async function requestedPlanSemester(
  raw: unknown,
  schoolYearId: number,
  at: Date = new Date(),
): Promise<PlanSemester> {
  return isPlanSemester(raw) ? raw : resolvePlanSemester(schoolYearId, at)
}
