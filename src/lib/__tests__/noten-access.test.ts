import { beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '@/lib/prisma'
import { distinctHalfDays, recordedHalfDays, resolveNotenAccess } from '@/lib/noten-access'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    teacherAssignment: { findFirst: vi.fn() },
    notenEntry: { findMany: vi.fn() },
  },
}))
vi.mock('@/lib/combined-classes', () => ({
  resolveMemberClassIds: vi.fn(async (classId: number) => (classId === 9 ? [3, 4] : [classId])),
}))

/** Local midnight, like the dates the routes key entries by. */
const day = (ymd: string) => new Date(`${ymd}T00:00:00`)
// 2026-10-05 is a Monday (1), 2026-10-08 a Thursday (4).
const mondayEntry = { studentId: 11, groupId: 2, date: day('2026-10-05'), period: 'AM' }
const thursdayEntry = { studentId: 12, groupId: 1, date: day('2026-10-08'), period: 'PM' }

const who = { teacherId: 7, classId: 3, schoolYearId: 1 }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(prisma.teacherAssignment.findFirst).mockResolvedValue(null)
  vi.mocked(prisma.notenEntry.findMany).mockResolvedValue([])
})

describe('resolveNotenAccess', () => {
  it('is "assigned" for a teacher on the plan', async () => {
    vi.mocked(prisma.teacherAssignment.findFirst).mockResolvedValue({ id: 1 } as never)

    expect(await resolveNotenAccess(who)).toBe('assigned')
    expect(prisma.notenEntry.findMany).not.toHaveBeenCalled()
  })

  it('is "former" for a teacher taken off the plan who recorded marks', async () => {
    vi.mocked(prisma.notenEntry.findMany).mockResolvedValue([mondayEntry] as never)

    expect(await resolveNotenAccess(who)).toBe('former')
  })

  it('is null for a teacher who never had anything to do with the class', async () => {
    expect(await resolveNotenAccess(who)).toBeNull()
  })

  it('asks the question of the requested weekday', async () => {
    // Still on the Thursday plan, taken off Monday — where the marks were recorded.
    vi.mocked(prisma.teacherAssignment.findFirst).mockImplementation((async (args: {
      where: { selectedWeekday?: number }
    }) => (args.where.selectedWeekday === 4 ? { id: 1 } : null)) as never)
    vi.mocked(prisma.notenEntry.findMany).mockResolvedValue([mondayEntry] as never)

    expect(await resolveNotenAccess({ ...who, weekday: '4' })).toBe('assigned')
    expect(await resolveNotenAccess({ ...who, weekday: '1' })).toBe('former')
  })

  it('keeps the class-level answer for a day with neither a plan nor marks', async () => {
    vi.mocked(prisma.teacherAssignment.findFirst).mockImplementation((async (args: {
      where: { selectedWeekday?: number }
    }) => (args.where.selectedWeekday == null ? { id: 1 } : null)) as never)

    expect(await resolveNotenAccess({ ...who, weekday: 2 })).toBe('assigned')
  })
})

describe('recordedHalfDays', () => {
  it('reads a combined class through its member classes and filters by weekday', async () => {
    vi.mocked(prisma.notenEntry.findMany).mockResolvedValue([mondayEntry, thursdayEntry] as never)

    const rows = await recordedHalfDays({ ...who, classId: 9, groupId: 2, weekday: 1 })

    expect(rows).toEqual([mondayEntry])
    expect(prisma.notenEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ teacherId: 7, classId: { in: [3, 4] }, groupId: 2 }),
      }),
    )
  })
})

describe('distinctHalfDays', () => {
  it('collapses students onto half-days, in date order with AM before PM', () => {
    expect(
      distinctHalfDays([
        thursdayEntry,
        { date: day('2026-10-05'), period: 'PM' },
        mondayEntry,
        { ...mondayEntry, studentId: 13 },
      ]),
    ).toEqual([
      { date: '2026-10-05', period: 'AM' },
      { date: '2026-10-05', period: 'PM' },
      { date: '2026-10-08', period: 'PM' },
    ])
  })
})
