import { beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '@/lib/prisma'
import {
  applyWeekdayGroups,
  dropGroupsOutsideClass,
  gradeGroupDay,
  resolveGroupWeekday,
  studentGroupByWeekday,
} from '@/lib/weekday-groups'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    studentWeekdayGroup: { findMany: vi.fn(), deleteMany: vi.fn() },
    teacherAssignment: { findFirst: vi.fn(), findMany: vi.fn() },
    schedule: { findFirst: vi.fn() },
    combinedClassMember: { findMany: vi.fn() },
  },
}))

const students = [
  { id: 1, groupId: 1 },
  { id: 2, groupId: 1 },
  { id: 3, groupId: 2 },
]

describe('applyWeekdayGroups', () => {
  it('leaves students untouched when the day has no stored grouping', () => {
    expect(applyWeekdayGroups(students, new Map())).toEqual(students)
  })

  it("replaces every group with the day's, unassigning students absent from it", () => {
    const day = new Map([
      [1, 2],
      [3, 1],
    ])
    expect(applyWeekdayGroups(students, day)).toEqual([
      { id: 1, groupId: 2 },
      { id: 2, groupId: null },
      { id: 3, groupId: 1 },
    ])
  })
})

describe('resolveGroupWeekday', () => {
  beforeEach(() => vi.clearAllMocks())

  it('prefers an explicit weekday', async () => {
    expect(
      await resolveGroupWeekday({ classId: 1, schoolYearId: 1, teacherId: 5, weekday: 4 }),
    ).toBe(4)
    expect(prisma.teacherAssignment.findFirst).not.toHaveBeenCalled()
  })

  it("uses the teacher's own (earliest) teaching day", async () => {
    vi.mocked(prisma.teacherAssignment.findFirst).mockResolvedValue({ selectedWeekday: 3 } as never)
    expect(await resolveGroupWeekday({ classId: 1, schoolYearId: 1, teacherId: 5 })).toBe(3)
    expect(prisma.teacherAssignment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { classId: 1, schoolYearId: 1, teacherId: 5 },
        orderBy: { selectedWeekday: 'asc' },
      }),
    )
  })

  it("falls back to the class's first planned day for a non-teaching viewer", async () => {
    vi.mocked(prisma.teacherAssignment.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.schedule.findFirst).mockResolvedValue({ selectedWeekday: 2 } as never)
    expect(await resolveGroupWeekday({ classId: 1, schoolYearId: 1, teacherId: 5 })).toBe(2)
  })

  it('is null for a class without a plan', async () => {
    vi.mocked(prisma.schedule.findFirst).mockResolvedValue(null)
    expect(await resolveGroupWeekday({ classId: 1, schoolYearId: 1 })).toBeNull()
  })
})

describe('gradeGroupDay', () => {
  beforeEach(() => vi.clearAllMocks())

  it('parses a raw query weekday', async () => {
    expect(await gradeGroupDay({ classId: 7, schoolYearId: 1, weekday: '5' })).toEqual({
      classId: 7,
      schoolYearId: 1,
      weekday: 5,
    })
  })

  it('ignores a blank query weekday', async () => {
    vi.mocked(prisma.schedule.findFirst).mockResolvedValue({ selectedWeekday: 1 } as never)
    expect(await gradeGroupDay({ classId: 7, schoolYearId: 1, weekday: '' })).toEqual({
      classId: 7,
      schoolYearId: 1,
      weekday: 1,
    })
  })
})

describe('studentGroupByWeekday', () => {
  beforeEach(() => vi.clearAllMocks())

  it('keeps Student.groupId on every day when no per-day rows exist', async () => {
    vi.mocked(prisma.studentWeekdayGroup.findMany).mockResolvedValue([])
    const groupOn = await studentGroupByWeekday({
      studentId: 1,
      classId: 1,
      schoolYearId: 1,
      fallback: 3,
    })
    expect([1, 3, 5].map(groupOn)).toEqual([3, 3, 3])
  })

  it("returns each day's group, and none on a day without a row", async () => {
    vi.mocked(prisma.studentWeekdayGroup.findMany).mockResolvedValue([
      { classId: 1, selectedWeekday: 1, groupId: 2 },
      { classId: 1, selectedWeekday: 4, groupId: 1 },
    ] as never)
    const groupOn = await studentGroupByWeekday({
      studentId: 1,
      classId: 1,
      schoolYearId: 1,
      fallback: 3,
    })
    expect([groupOn(1), groupOn(3), groupOn(4)]).toEqual([2, null, 1])
  })

  it("prefers the student's own class over a combined class on the same day", async () => {
    vi.mocked(prisma.studentWeekdayGroup.findMany).mockResolvedValue([
      { classId: 1, selectedWeekday: 2, groupId: 1 },
      { classId: 99, selectedWeekday: 2, groupId: 4 },
    ] as never)
    const groupOn = await studentGroupByWeekday({
      studentId: 1,
      classId: 1,
      schoolYearId: 1,
      fallback: null,
    })
    expect(groupOn(2)).toBe(1)
  })
})

describe('dropGroupsOutsideClass', () => {
  it('keeps the new class and the combined classes spanning it', async () => {
    vi.mocked(prisma.combinedClassMember.findMany).mockResolvedValue([
      { combinedClassId: 40 },
    ] as never)
    const keep = await dropGroupsOutsideClass(prisma, 5, 2)
    expect(keep).toEqual([2, 40])
    expect(prisma.studentWeekdayGroup.deleteMany).toHaveBeenCalledWith({
      where: { studentId: 5, classId: { notIn: [2, 40] } },
    })
  })
})
