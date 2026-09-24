import { beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '@/lib/prisma'
import { groupSettingsWeekday } from '@/lib/weekday-groups'
import { GET, PATCH } from '../route'

vi.mock('next-auth', () => ({
  getServerSession: vi.fn(async () => ({ user: { name: 'anna.huber', role: 'teacher' } })),
}))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/sentry', () => ({ captureError: vi.fn() }))
vi.mock('@/lib/entitlements', () => ({ isFeatureEnabled: vi.fn(async () => true) }))
vi.mock('@/lib/session-teacher', () => ({ resolveSessionTeacher: vi.fn(async () => ({ id: 7 })) }))
vi.mock('@/lib/weekday-groups', () => ({
  groupSettingsWeekday: vi.fn(async ({ weekday }: { weekday?: string | number | null }) =>
    weekday != null && weekday !== '' ? Number(weekday) : 1,
  ),
}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    notenSeatingLayout: { findUnique: vi.fn(), upsert: vi.fn() },
  },
}))

const key = (selectedWeekday: number) => ({
  teacherId_classId_groupId_schoolYearId_selectedWeekday: {
    teacherId: 7,
    classId: 3,
    groupId: 1,
    schoolYearId: 2,
    selectedWeekday,
  },
})

describe('/api/noten/seating (per weekday)', () => {
  beforeEach(() => vi.clearAllMocks())

  it("reads the requested day's seat plan", async () => {
    vi.mocked(prisma.notenSeatingLayout.findUnique).mockResolvedValue({
      positions: { '5': { x: 0.5, y: 0.25 } },
    } as never)

    const res = await GET(
      new Request(
        'http://localhost/api/noten/seating?classId=3&groupId=1&schoolYearId=2&weekday=4',
      ),
    )

    expect(res.status).toBe(200)
    expect(prisma.notenSeatingLayout.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: key(4) }),
    )
    expect(await res.json()).toEqual({ positions: { '5': { x: 0.5, y: 0.25 } } })
  })

  it('saves the layout under its weekday', async () => {
    const res = await PATCH(
      new Request('http://localhost/api/noten/seating', {
        method: 'PATCH',
        body: JSON.stringify({
          classId: 3,
          groupId: 1,
          schoolYearId: 2,
          weekday: 4,
          positions: {},
        }),
      }),
    )

    expect(res.status).toBe(200)
    expect(groupSettingsWeekday).toHaveBeenCalledWith(expect.objectContaining({ weekday: 4 }))
    expect(prisma.notenSeatingLayout.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: key(4),
        create: expect.objectContaining({ selectedWeekday: 4 }),
      }),
    )
  })
})
