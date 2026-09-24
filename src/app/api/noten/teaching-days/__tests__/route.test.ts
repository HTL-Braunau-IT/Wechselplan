import { beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '@/lib/prisma'
import { GET } from '../route'

vi.mock('next-auth', () => ({
  getServerSession: vi.fn(async () => ({ user: { name: 'anna.huber', role: 'teacher' } })),
}))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/sentry', () => ({ captureError: vi.fn() }))
vi.mock('@/lib/entitlements', () => ({ isFeatureEnabled: vi.fn(async () => true) }))
vi.mock('@/lib/school-year', () => ({ resolveSchoolYearId: vi.fn(async () => 1) }))
vi.mock('@/lib/session-teacher', () => ({ resolveSessionTeacher: vi.fn(async () => ({ id: 7 })) }))
vi.mock('@/lib/weekday-groups', () => ({
  gradeGroupDay: vi.fn(async ({ weekday }: { weekday?: string | null }) => ({
    classId: 3,
    schoolYearId: 1,
    weekday: weekday ? Number(weekday) : 1,
  })),
}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    teacherAssignment: { findFirst: vi.fn(async () => ({ id: 1 })) },
    teacherRotation: { findMany: vi.fn() },
    schedule: { findFirst: vi.fn() },
  },
}))

const thursdayPlan = {
  turns: [
    {
      name: 'TURNUS 1',
      customLength: null,
      weeks: [
        { date: '01.10.26', week: 'KW40', isHoliday: false },
        { date: '08.10.26', week: 'KW41', isHoliday: true },
      ],
    },
  ],
}

describe('GET /api/noten/teaching-days (per weekday)', () => {
  beforeEach(() => {
    vi.mocked(prisma.teacherRotation.findMany).mockResolvedValue([
      { turnId: 'TURNUS 1', period: 'AM' },
    ] as never)
    vi.mocked(prisma.schedule.findFirst).mockResolvedValue(thursdayPlan as never)
  })

  it("reads only the chosen weekday's rotation and plan", async () => {
    const res = await GET(
      new Request('http://localhost/api/noten/teaching-days?classId=3&groupId=2&weekday=4'),
    )
    const data = (await res.json()) as { teachingDays: { date: string; period: string }[] }

    expect(res.status).toBe(200)
    expect(prisma.teacherRotation.findMany).toHaveBeenCalledWith({
      where: { teacherId: 7, classId: 3, groupId: 2, schoolYearId: 1, selectedWeekday: 4 },
    })
    expect(prisma.schedule.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { classId: 3, schoolYearId: 1, selectedWeekday: 4 } }),
    )
    // The holiday week is dropped.
    expect(data.teachingDays).toEqual([{ date: '2026-10-01', period: 'AM' }])
  })
})
