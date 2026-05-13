/** Defaults and pure helpers for schedule group limits (safe to import from client). */

export interface ScheduleLimitValues {
	maxStudentsPerGroup: number
	maxScheduleGroups: number
	maxSupportedStudents: number
}

export const SCHEDULE_LIMIT_DEFAULTS: ScheduleLimitValues = {
	maxStudentsPerGroup: 12,
	maxScheduleGroups: 4,
	maxSupportedStudents: 48,
}

/**
 * Default number of groups (2..maxScheduleGroups) for a class size:
 * largest g with studentCount > (g-1)*maxStudentsPerGroup.
 */
export function computeDefaultGroupCount(
  studentCount: number,
  maxStudentsPerGroup: number,
  maxScheduleGroups: number,
): number {
  const cap = Math.max(2, maxScheduleGroups)
  for (let g = cap; g >= 2; g--) {
    if (studentCount > (g - 1) * maxStudentsPerGroup) {
      return g
    }
  }
  return 2
}
