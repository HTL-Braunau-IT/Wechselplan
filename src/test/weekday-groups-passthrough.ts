import { vi } from 'vitest'

/**
 * Stand-in for `@/lib/weekday-groups` in tests that are not about per-weekday
 * groups: no day has stored rows, so every reader keeps Student.groupId — the
 * behaviour those tests were written against. Use as
 * `vi.mock('@/lib/weekday-groups', () => import('@/test/weekday-groups-passthrough'))`.
 */
export const weekdayGroupMap = vi.fn(async () => new Map<number, number>())
export const applyWeekdayGroups = vi.fn(<T>(students: T[]) => students)
export const overlayWeekdayGroups = vi.fn(async <T>(students: T[]) => students)
export const resolveGroupWeekday = vi.fn(async () => null)
export const gradeGroupDay = vi.fn(async () => null)
export const teacherWeekdaysForClass = vi.fn(async () => [] as number[])
export const studentGroupByWeekday = vi.fn(
  async ({ fallback }: { fallback: number | null }) =>
    () =>
      fallback,
)
export const planClassIdsFor = vi.fn(async (_tx: unknown, classId: number) => [classId])
export const dropGroupsOutsideClass = vi.fn(async (_tx: unknown, _s: number, classId: number) => [
  classId,
])
