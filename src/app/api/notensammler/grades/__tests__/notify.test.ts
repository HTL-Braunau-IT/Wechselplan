import { beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '@/lib/prisma'
import { notifyGradesEntered } from '../_notify'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    class: { findUnique: vi.fn() },
    teacher: { findMany: vi.fn() },
    notification: {
      findMany: vi.fn(),
      createMany: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}))

vi.mock('@/lib/sentry', () => ({ captureError: vi.fn() }))

const actor = { id: 9, name: 'Max Muster', role: 'teacher' }

const call = (count: number) =>
  notifyGradesEntered({
    classId: 3,
    className: '1AHIT',
    schoolYearId: 1,
    actor,
    session: null,
    count,
  })

describe('notifyGradesEntered', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.class.findUnique).mockResolvedValue({ classLeadId: 4 } as never)
    vi.mocked(prisma.teacher.findMany).mockResolvedValue([{ id: 4 }] as never)
    vi.mocked(prisma.notification.findMany).mockResolvedValue([] as never)
    vi.mocked(prisma.notification.createMany).mockResolvedValue({ count: 1 } as never)
    vi.mocked(prisma.notification.deleteMany).mockResolvedValue({ count: 0 } as never)
  })

  it('tells the class lead how much moved', async () => {
    await call(4)

    expect(prisma.notification.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          recipientId: 4,
          type: 'grades-entered',
          params: { className: '1AHIT', count: 4 },
        }),
      ],
    })
  })

  it('stays silent when a save changed nothing', async () => {
    await call(0)

    expect(prisma.class.findUnique).not.toHaveBeenCalled()
    expect(prisma.notification.createMany).not.toHaveBeenCalled()
  })

  it('survives a failing class-lead lookup', async () => {
    // The lookup runs after the grades have been committed. If it were outside
    // the bestEffort block its rejection would escape into the route's catch and
    // report a 500 for a save that actually succeeded.
    vi.mocked(prisma.class.findUnique).mockRejectedValue(new Error('db down'))

    await expect(call(4)).resolves.toBeUndefined()
  })

  it('survives a failing notification write', async () => {
    vi.mocked(prisma.notification.createMany).mockRejectedValue(new Error('db down'))

    await expect(call(4)).resolves.toBeUndefined()
  })
})
