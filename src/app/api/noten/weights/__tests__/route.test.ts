import { beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '@/lib/prisma'
import { PATCH } from '../route'

vi.mock('next-auth', () => ({
  getServerSession: vi.fn(async () => ({ user: { name: 'anna.huber', role: 'teacher' } })),
}))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/sentry', () => ({ captureError: vi.fn() }))
vi.mock('@/lib/entitlements', () => ({ isFeatureEnabled: vi.fn(async () => true) }))
vi.mock('@/lib/session-teacher', () => ({ resolveSessionTeacher: vi.fn(async () => ({ id: 7 })) }))
vi.mock('@/lib/weekday-groups', () => ({
  groupSettingsWeekday: vi.fn(async ({ weekday }: { weekday?: number | null }) => weekday ?? 1),
}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    teacherAssignment: { findFirst: vi.fn(async () => ({ id: 1 })) },
    notenWeightConfig: { upsert: vi.fn(), deleteMany: vi.fn() },
    notenWeightClassConfig: { upsert: vi.fn(), deleteMany: vi.fn() },
    notenWeightGlobalConfig: { upsert: vi.fn(), deleteMany: vi.fn() },
  },
}))

const patch = (body: object) =>
  PATCH(
    new Request('http://localhost/api/noten/weights', {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  )

const split = {
  weightWiederholung: 40,
  weightBericht: 20,
  weightMitarbeit: 20,
  weightPraktischeArbeit: 20,
}

describe('PATCH /api/noten/weights (group level per weekday)', () => {
  beforeEach(() => vi.clearAllMocks())

  it("writes a group's weights for that group's weekday", async () => {
    const res = await patch({
      level: 'group',
      classId: 3,
      groupId: 1,
      schoolYearId: 2,
      weekday: 4,
      ...split,
    })

    expect(res.status).toBe(200)
    expect(prisma.notenWeightConfig.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          teacherId_classId_groupId_schoolYearId_selectedWeekday: {
            teacherId: 7,
            classId: 3,
            groupId: 1,
            schoolYearId: 2,
            selectedWeekday: 4,
          },
        },
        create: expect.objectContaining({ selectedWeekday: 4, weightWiederholung: 40 }),
      }),
    )
  })

  it("clears only that weekday's group override", async () => {
    const res = await patch({
      level: 'group',
      clear: true,
      classId: 3,
      groupId: 1,
      schoolYearId: 2,
      weekday: 4,
    })

    expect(res.status).toBe(200)
    expect(prisma.notenWeightConfig.deleteMany).toHaveBeenCalledWith({
      where: { teacherId: 7, classId: 3, groupId: 1, schoolYearId: 2, selectedWeekday: 4 },
    })
  })

  it('leaves the class level untouched by weekdays', async () => {
    await patch({ level: 'class', classId: 3, schoolYearId: 2, ...split })
    expect(prisma.notenWeightClassConfig.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { teacherId_classId_schoolYearId: { teacherId: 7, classId: 3, schoolYearId: 2 } },
      }),
    )
  })
})
