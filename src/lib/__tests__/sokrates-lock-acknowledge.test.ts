import { beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '@/lib/prisma'
import { notify } from '@/lib/notifications'
import { acknowledgeSokratesChangeNotices } from '@/lib/sokrates-lock'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    sokratesChangeNotice: { findMany: vi.fn(), updateMany: vi.fn() },
  },
}))

// Keep bestEffort/notensammlerLink real (so a notify failure is swallowed as in
// production); only the delivery itself is a spy.
vi.mock('@/lib/notifications', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/notifications')>()),
  notify: vi.fn(),
}))
vi.mock('@/lib/sentry', () => ({ captureError: vi.fn() }))
vi.mock('@/server/send-support-email-graph', () => ({ sendEmail: vi.fn() }))

const now = new Date('2026-03-10T09:00:00.000Z')

describe('acknowledgeSokratesChangeNotices', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.sokratesChangeNotice.updateMany).mockResolvedValue({ count: 0 } as never)
    vi.mocked(notify).mockResolvedValue(0 as never)
  })

  it('marks the open notices acknowledged and notifies each changer once', async () => {
    vi.mocked(prisma.sokratesChangeNotice.findMany).mockResolvedValue([
      { id: 1, changedById: 42, className: '1AHIT' },
      { id: 2, changedById: 42, className: '1AHIT' },
      { id: 3, changedById: 99, className: '1AHIT' },
    ] as never)

    const count = await acknowledgeSokratesChangeNotices({
      scopes: [{ classId: 3, schoolYearId: 2, semester: 'first' }],
      recipientId: 7,
      acknowledgedByName: 'Anna Berger',
      now,
    })

    expect(count).toBe(3)
    expect(prisma.sokratesChangeNotice.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [1, 2, 3] } },
      data: { acknowledgedAt: now },
    })

    // Teacher 42 changed two grades → one notify with count 2; teacher 99 → count 1.
    expect(notify).toHaveBeenCalledTimes(2)
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'sokrates-change-acknowledged',
        recipientIds: [42],
        actorId: 7,
        params: { className: '1AHIT', semester: 'first', count: 2 },
      }),
    )
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ recipientIds: [99], params: expect.objectContaining({ count: 1 }) }),
    )
  })

  it('does nothing when there are no open notices', async () => {
    vi.mocked(prisma.sokratesChangeNotice.findMany).mockResolvedValue([] as never)

    const count = await acknowledgeSokratesChangeNotices({
      scopes: [{ classId: 3, schoolYearId: 2, semester: 'first' }],
      recipientId: 7,
      acknowledgedByName: 'Anna Berger',
      now,
    })

    expect(count).toBe(0)
    expect(prisma.sokratesChangeNotice.updateMany).not.toHaveBeenCalled()
    expect(notify).not.toHaveBeenCalled()
  })

  it('skips notifying for a change made by an admin without a Teacher row', async () => {
    vi.mocked(prisma.sokratesChangeNotice.findMany).mockResolvedValue([
      { id: 1, changedById: null, className: '1AHIT' },
    ] as never)

    const count = await acknowledgeSokratesChangeNotices({
      scopes: [{ classId: 3, schoolYearId: 2, semester: 'first' }],
      recipientId: 7,
      acknowledgedByName: 'Anna Berger',
      now,
    })

    expect(count).toBe(1)
    expect(notify).not.toHaveBeenCalled()
  })

  it('returns 0 for an empty scope list', async () => {
    const count = await acknowledgeSokratesChangeNotices({
      scopes: [],
      recipientId: 7,
      acknowledgedByName: 'Anna Berger',
      now,
    })

    expect(count).toBe(0)
    expect(prisma.sokratesChangeNotice.findMany).not.toHaveBeenCalled()
  })
})
