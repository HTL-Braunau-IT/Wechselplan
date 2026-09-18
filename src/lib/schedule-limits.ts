/**
 * Sizing limits for a rotation schedule (Wechselplan).
 *
 * These numbers used to live as separate magic literals in the wizard
 * (src/app/schedule/create/page.tsx) and the combine-classes endpoint
 * (src/app/api/classes/combine/route.ts), where they could — and did — drift
 * apart. They are coupled (MAX_SUPPORTED_STUDENTS = MAX_GROUPS × MAX_GROUP_SIZE),
 * so they now share one source of truth.
 *
 * A schedule assigns one teacher per group per period (AM/PM) and rotates them
 * round-robin over the turnus columns, so the number of teachers a plan can hold
 * equals the number of groups — MAX_GROUPS is therefore also the maximum teachers
 * per period.
 */

// Fewest groups a plan can be split into.
export const MIN_GROUPS = 2

// Most groups a plan can be split into. Also the max teachers per period,
// since teachers are 1:1 with groups in the rotation.
export const MAX_GROUPS = 5

// Maximum size of a single (non-unassigned) group.
export const MAX_GROUP_SIZE = 12

// Largest class the wizard will load / the largest combined class we allow.
// MAX_GROUPS full groups of MAX_GROUP_SIZE students.
export const MAX_SUPPORTED_STUDENTS = MAX_GROUPS * MAX_GROUP_SIZE

/**
 * Seeds a sensible default group count from a class's student count, clamped to
 * [MIN_GROUPS, MAX_GROUPS]. Each additional group is added once the roster grows
 * past another ~18 students, keeping default groups comfortably under the size cap.
 */
export function seedGroupCount(studentCount: number): number {
  const groups =
    studentCount > 48 ? 5 : studentCount > 36 ? 4 : studentCount > 18 ? 3 : 2
  return Math.min(Math.max(groups, MIN_GROUPS), MAX_GROUPS)
}
