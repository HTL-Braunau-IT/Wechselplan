import { beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '@/lib/prisma'
import { weekdayGroupMap } from '@/lib/weekday-groups'
import { teachingDaysFor } from '@/lib/teaching-days'
import { writeOnlineShellGrades } from '@/lib/online-shell/grades'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    schoolYear: { findMany: vi.fn() },
    student: { findMany: vi.fn() },
    teacherAssignment: { findMany: vi.fn() },
    notenEntry: { findUnique: vi.fn(), upsert: vi.fn() },
  },
}))
vi.mock('@/lib/weekday-groups', () => ({
  planClassIdsFor: vi.fn(async (_tx: unknown, classId: number) => [classId, 99]),
  weekdayGroupMap: vi.fn(),
}))
vi.mock('@/lib/teaching-days', () => ({ teachingDaysFor: vi.fn() }))

const year = { id: 1, startDate: new Date('2026-09-01'), endDate: new Date('2027-07-01') }
// 2026-11-09 is a Monday.
const entry = { studentOid: 'oid-a', date: '2026-11-09', period: 'AM' as const, grade: 2 }

function run(overrides: Partial<Parameters<typeof writeOnlineShellGrades>[0]> = {}) {
  return writeOnlineShellGrades({
    teacherId: 7,
    classId: 12,
    field: 'praktischeArbeit1',
    overwrite: false,
    entries: [entry],
    ...overrides,
  })
}

describe('writeOnlineShellGrades', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.schoolYear.findMany).mockResolvedValue([year] as never)
    vi.mocked(prisma.student.findMany).mockResolvedValue([
      { id: 5, externalId: 'oid-a', groupId: 1, classMemberships: [{ schoolYearId: 1 }] },
    ] as never)
    vi.mocked(prisma.teacherAssignment.findMany).mockResolvedValue([{ classId: 12 }] as never)
    vi.mocked(weekdayGroupMap).mockResolvedValue(new Map([[5, 2]]))
    vi.mocked(teachingDaysFor).mockResolvedValue([
      { date: '2026-11-09', period: 'AM', turn: 'TURNUS 1' },
    ])
    vi.mocked(prisma.notenEntry.findUnique).mockResolvedValue(null)
  })

  it("writes only the chosen column, keyed to the student's group that weekday", async () => {
    expect(await run()).toEqual([{ studentOid: 'oid-a', status: 'written' }])
    expect(teachingDaysFor).toHaveBeenCalledWith({
      teacherId: 7,
      classId: 12,
      groupId: 2,
      schoolYearId: 1,
      weekday: 1,
    })
    const key = {
      studentId: 5,
      teacherId: 7,
      classId: 12,
      groupId: 2,
      schoolYearId: 1,
      date: new Date('2026-11-09T00:00:00.000Z'),
      period: 'AM',
    }
    expect(prisma.notenEntry.upsert).toHaveBeenCalledWith({
      where: { studentId_teacherId_classId_groupId_schoolYearId_date_period: key },
      create: { ...key, praktischeArbeit1: 2 },
      update: { praktischeArbeit1: 2 },
    })
  })

  it('keeps a different existing mark unless overwrite is set', async () => {
    vi.mocked(prisma.notenEntry.findUnique).mockResolvedValue({ praktischeArbeit1: 4 } as never)
    expect(await run()).toEqual([{ studentOid: 'oid-a', status: 'exists', existing: 4 }])
    expect(prisma.notenEntry.upsert).not.toHaveBeenCalled()

    expect(await run({ overwrite: true })).toEqual([{ studentOid: 'oid-a', status: 'written' }])
  })

  it('reports an identical mark as unchanged', async () => {
    vi.mocked(prisma.notenEntry.findUnique).mockResolvedValue({ praktischeArbeit1: 2 } as never)
    expect(await run()).toEqual([{ studentOid: 'oid-a', status: 'unchanged' }])
    expect(prisma.notenEntry.upsert).not.toHaveBeenCalled()
  })

  it("rejects a half-day that is not the teacher's teaching day for the group", async () => {
    expect(await run({ entries: [{ ...entry, period: 'PM' }] })).toEqual([
      { studentOid: 'oid-a', status: 'not_teaching_day' },
    ])
  })

  it('rejects a weekday the teacher does not have the class', async () => {
    vi.mocked(prisma.teacherAssignment.findMany).mockResolvedValue([] as never)
    expect(await run()).toEqual([{ studentOid: 'oid-a', status: 'not_teaching_day' }])
  })

  it('uses the combined plan when the teacher has the class only through it', async () => {
    vi.mocked(prisma.teacherAssignment.findMany).mockResolvedValue([{ classId: 99 }] as never)
    await run()
    expect(weekdayGroupMap).toHaveBeenCalledWith({ classId: 99, schoolYearId: 1, weekday: 1 })
    expect(prisma.notenEntry.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ classId: 12 }) }),
    )
  })

  it('rejects unknown students, bad grades and students without a group', async () => {
    expect(await run({ entries: [{ ...entry, studentOid: 'nobody' }] })).toEqual([
      { studentOid: 'nobody', status: 'unknown_student' },
    ])
    expect(await run({ entries: [{ ...entry, grade: 6 }] })).toEqual([
      { studentOid: 'oid-a', status: 'invalid' },
    ])
    vi.mocked(weekdayGroupMap).mockResolvedValue(new Map([[6, 1]]))
    expect(await run()).toEqual([{ studentOid: 'oid-a', status: 'no_group' }])
  })
})
