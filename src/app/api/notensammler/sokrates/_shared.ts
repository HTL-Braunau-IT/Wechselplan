import type { Semester } from '@/lib/grades'

// Re-exported so the sokrates route handlers can import everything from here.
export { resolveCurrentTeacher, type CurrentTeacher } from '@/lib/current-teacher'
export { resolveSchoolYearId } from '@/lib/school-year'

/** Narrows an unknown value to a valid semester, or null. */
export function parseSemester(raw: unknown): Semester | null {
  return raw === 'first' || raw === 'second' ? raw : null
}

/** Parses an id from a number or numeric string; null when not an integer. */
export function parseId(raw: unknown): number | null {
  const parsed = typeof raw === 'number' ? raw : typeof raw === 'string' ? parseInt(raw, 10) : NaN
  return Number.isInteger(parsed) ? parsed : null
}
