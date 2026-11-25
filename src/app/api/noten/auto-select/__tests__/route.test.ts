import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getServerSession } from 'next-auth'
import { GET } from '../route'
import { prisma } from '@/lib/prisma'
import { resolveSessionTeacher } from '@/lib/session-teacher'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    teacherAssignment: { findMany: vi.fn() },
    teacherRotation: { findMany: vi.fn() },
    schedule: { findFirst: vi.fn(), findMany: vi.fn() },
    // The assignments are scoped to the semester of the requested date; with no
    // year row that is the first semester.
    schoolYear: { findUnique: vi.fn(async () => null) },
  },
}))
vi.mock('@/lib/sentry', () => ({ captureError: vi.fn() }))
vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/session-teacher', () => ({ resolveSessionTeacher: vi.fn() }))

const TEACHER = 7

const weeks = (dates: string[]) => dates.map(date => ({ date, isHoliday: false }))

/** Rotation rows for one class/lane: TURNUS n → group. */
const rotation = (classId: number, period: string, weekday: number, groups: number[]) =>
  groups.map((groupId, i) => ({
    classId,
    groupId,
    teacherId: TEACHER,
    turnId: `TURNUS ${i + 1}`,
    period,
    selectedWeekday: weekday,
    schoolYearId: 1,
  }))

/** The teacher's own assignment rows only carry their starting group. */
const assignment = (classId: number, period: string, weekday: number, groupId: number) => ({
  classId,
  groupId,
  selectedWeekday: weekday,
  period,
})

async function call(query: string) {
  const res = await GET(
    new Request(`http://localhost/api/noten/auto-select?schoolYearId=1&${query}`),
  )
  return (await res.json()) as { classId: number | null; groupId: number | null; weekday?: number }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getServerSession).mockResolvedValue({ user: { name: 'teacher' } } as never)
  vi.mocked(resolveSessionTeacher).mockResolvedValue({ id: TEACHER } as never)
})

describe('auto-select: current slot', () => {
  it('marks the rotation group from TURNUS 2 on, not the starting group', async () => {
    vi.mocked(prisma.teacherAssignment.findMany).mockResolvedValue([
      assignment(1, 'PM', 1, 1),
    ] as never)
    vi.mocked(prisma.teacherRotation.findMany).mockResolvedValue(
      rotation(1, 'PM', 1, [1, 2]) as never,
    )
    vi.mocked(prisma.schedule.findMany).mockResolvedValue([
      {
        classId: 1,
        turns: [
          { name: 'TURNUS 1', period: 'PM', weeks: weeks(['02.11.26', '09.11.26']) },
          { name: 'TURNUS 2', period: 'PM', weeks: weeks(['16.11.26', '23.11.26']) },
        ],
      },
    ] as never)

    expect(await call('date=2026-11-16&period=PM')).toEqual({ classId: 1, groupId: 2, weekday: 1 })
  })

  it('reads the turnus from the requested lane only', async () => {
    vi.mocked(prisma.teacherAssignment.findMany).mockResolvedValue([
      assignment(1, 'PM', 1, 1),
    ] as never)
    vi.mocked(prisma.teacherRotation.findMany).mockResolvedValue(
      rotation(1, 'PM', 1, [1, 2]) as never,
    )
    // The AM lane is still in TURNUS 1 on 16.11, the PM lane already in TURNUS 2.
    vi.mocked(prisma.schedule.findMany).mockResolvedValue([
      {
        classId: 1,
        turns: [
          { name: 'TURNUS 1', period: 'AM', weeks: weeks(['16.11.26']) },
          { name: 'TURNUS 1', period: 'PM', weeks: weeks(['09.11.26']) },
          { name: 'TURNUS 2', period: 'AM', weeks: weeks(['23.11.26']) },
          { name: 'TURNUS 2', period: 'PM', weeks: weeks(['16.11.26']) },
        ],
      },
    ] as never)

    expect((await call('date=2026-11-16&period=PM')).groupId).toBe(2)
  })

  it('picks the biweekly class that meets this week', async () => {
    vi.mocked(prisma.teacherAssignment.findMany).mockResolvedValue([
      assignment(1, 'PM', 1, 1),
      assignment(2, 'PM', 1, 2),
    ] as never)
    vi.mocked(prisma.teacherRotation.findMany).mockResolvedValue([
      ...rotation(1, 'PM', 1, [1]),
      ...rotation(2, 'PM', 1, [2]),
    ] as never)
    vi.mocked(prisma.schedule.findMany).mockResolvedValue([
      { classId: 1, turns: [{ name: 'TURNUS 1', period: 'PM', weeks: weeks(['09.11.26']) }] },
      { classId: 2, turns: [{ name: 'TURNUS 1', period: 'PM', weeks: weeks(['16.11.26']) }] },
    ] as never)

    expect(await call('date=2026-11-16&period=PM')).toEqual({ classId: 2, groupId: 2, weekday: 1 })
  })
})

describe('auto-select: one class', () => {
  beforeEach(() => {
    vi.mocked(prisma.teacherAssignment.findMany).mockResolvedValue([
      assignment(1, 'PM', 5, 1),
    ] as never)
    vi.mocked(prisma.teacherRotation.findMany).mockResolvedValue(
      rotation(1, 'PM', 5, [1, 2]) as never,
    )
    // Friday lane: TURNUS 2 starts on Fri 20.11.26.
    vi.mocked(prisma.schedule.findFirst).mockResolvedValue({
      classId: 1,
      turns: [
        { name: 'TURNUS 1', period: 'PM', weeks: weeks(['06.11.26', '13.11.26']) },
        { name: 'TURNUS 2', period: 'PM', weeks: weeks(['20.11.26', '27.11.26']) },
      ],
    } as never)
  })

  it("resolves this week's lesson on that weekday, not today", async () => {
    // Viewed on Tuesday 17.11 the Friday group is already TURNUS 2's.
    expect(await call('classId=1&weekday=5&date=2026-11-17')).toEqual({
      classId: 1,
      groupId: 2,
      weekday: 5,
    })
  })

  it('keeps the earlier turnus before the change', async () => {
    expect((await call('classId=1&weekday=5&date=2026-11-10')).groupId).toBe(1)
  })
})
