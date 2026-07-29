import { beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '@/lib/prisma'
import { classAudience, notify, notifyQuietly } from '@/lib/notifications'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    teacher: { findMany: vi.fn() },
    class: { findUnique: vi.fn() },
    teacherAssignment: { findMany: vi.fn() },
    teacherRotation: { findMany: vi.fn() },
    notification: {
      findMany: vi.fn(),
      createMany: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}))

vi.mock('@/lib/sentry', () => ({ captureError: vi.fn() }))

/** Every id passed in is an active teacher, unless a test says otherwise. */
const allTeachersActive = () =>
  vi
    .mocked(prisma.teacher.findMany)
    .mockImplementation((async (args: { where: { id: { in: number[] } } }) =>
      args.where.id.in.map(id => ({ id }))) as never)

const scheduleCreated = (recipientIds: number[], actorId: number | null = 99) =>
  notify({
    type: 'schedule-created',
    recipientIds,
    actorId,
    actorName: 'A B',
    params: { className: '1AHIT' },
  })

describe('notify', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    allTeachersActive()
    vi.mocked(prisma.notification.findMany).mockResolvedValue([])
    vi.mocked(prisma.notification.createMany).mockResolvedValue({ count: 0 })
    vi.mocked(prisma.notification.updateMany).mockResolvedValue({ count: 0 })
    vi.mocked(prisma.notification.deleteMany).mockResolvedValue({ count: 0 })
  })

  it('writes one row per recipient', async () => {
    const notified = await scheduleCreated([1, 2, 3])

    expect(notified).toBe(3)
    expect(prisma.notification.createMany).toHaveBeenCalledWith({
      data: [1, 2, 3].map(recipientId =>
        expect.objectContaining({ recipientId, type: 'schedule-created' }),
      ),
    })
  })

  it('never tells the actor about their own change', async () => {
    const notified = await scheduleCreated([1, 42, 2], 42)

    expect(notified).toBe(2)
    const [call] = vi.mocked(prisma.notification.createMany).mock.calls
    expect(call?.[0].data).toHaveLength(2)
  })

  it('collapses duplicates and blanks in the candidate list', async () => {
    await scheduleCreated([1, 1, 2] as never)
    const [call] = vi.mocked(prisma.notification.createMany).mock.calls
    expect(call?.[0].data).toHaveLength(2)
  })

  it('drops nulls without querying when nobody is left', async () => {
    const notified = await notify({
      type: 'schedule-created',
      recipientIds: [null, undefined],
      actorId: 1,
      actorName: 'A B',
      params: { className: '1AHIT' },
    })

    expect(notified).toBe(0)
    expect(prisma.teacher.findMany).not.toHaveBeenCalled()
    expect(prisma.notification.createMany).not.toHaveBeenCalled()
  })

  it('skips teachers directory sync has deactivated', async () => {
    // teacher.findMany defaults to active-only, so a departed teacher simply
    // does not come back from the lookup.
    vi.mocked(prisma.teacher.findMany).mockResolvedValue([{ id: 1 }] as never)

    const notified = await scheduleCreated([1, 2])

    expect(notified).toBe(1)
    const [call] = vi.mocked(prisma.notification.createMany).mock.calls
    expect(call?.[0].data).toEqual([expect.objectContaining({ recipientId: 1 })])
  })

  describe('collapsing', () => {
    it('refreshes an unread row with the same key instead of adding one', async () => {
      vi.mocked(prisma.notification.findMany).mockResolvedValue([
        { id: 7, recipientId: 1 },
      ] as never)

      await notify({
        type: 'grades-entered',
        recipientIds: [1],
        actorId: 9,
        actorName: 'A B',
        params: { className: '1AHIT', count: 4 },
        dedupeKey: 'grades-entered:1:1:9',
      })

      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: { id: { in: [7] } },
        data: expect.objectContaining({ params: { className: '1AHIT', count: 4 } }),
      })
      expect(prisma.notification.createMany).not.toHaveBeenCalled()
    })

    it('moves the timestamp so a collapsed row reads as the latest occurrence', async () => {
      vi.mocked(prisma.notification.findMany).mockResolvedValue([
        { id: 7, recipientId: 1 },
      ] as never)

      await notify({
        type: 'grades-entered',
        recipientIds: [1],
        actorId: 9,
        actorName: 'A B',
        params: { className: '1AHIT', count: 4 },
        dedupeKey: 'k',
      })

      const [call] = vi.mocked(prisma.notification.updateMany).mock.calls
      expect(call?.[0].data).toMatchObject({ createdAt: expect.any(Date) })
    })

    it('still creates rows for recipients without an unread one', async () => {
      vi.mocked(prisma.notification.findMany).mockResolvedValue([
        { id: 7, recipientId: 1 },
      ] as never)

      await notify({
        type: 'grades-entered',
        recipientIds: [1, 2],
        actorId: 9,
        actorName: 'A B',
        params: { className: '1AHIT', count: 4 },
        dedupeKey: 'k',
      })

      expect(prisma.notification.createMany).toHaveBeenCalledWith({
        data: [expect.objectContaining({ recipientId: 2 })],
      })
    })

    it('folds a different type onto the same key', async () => {
      // Walking the schedule wizard posts to three endpoints under one key; the
      // recipient should end up with one row describing the latest of them.
      vi.mocked(prisma.notification.findMany).mockResolvedValue([
        { id: 7, recipientId: 1 },
      ] as never)

      await notify({
        type: 'schedule-rotation-changed',
        recipientIds: [1],
        actorId: 9,
        actorName: 'A B',
        params: { className: '1AHIT' },
        dedupeKey: 'schedule:1:1',
      })

      const [lookup] = vi.mocked(prisma.notification.findMany).mock.calls
      expect(lookup?.[0]?.where).not.toHaveProperty('type')
      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: { id: { in: [7] } },
        data: expect.objectContaining({ type: 'schedule-rotation-changed' }),
      })
      expect(prisma.notification.createMany).not.toHaveBeenCalled()
    })

    it('does not look for anything to collapse without a key', async () => {
      await scheduleCreated([1])
      expect(prisma.notification.findMany).not.toHaveBeenCalled()
    })
  })

  it('prunes long-read notifications for the recipients it touched', async () => {
    await scheduleCreated([1])

    const [call] = vi.mocked(prisma.notification.deleteMany).mock.calls
    expect(call?.[0]?.where).toMatchObject({
      recipientId: { in: [1] },
      readAt: { lt: expect.any(Date) },
    })
  })
})

describe('notifyQuietly', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    allTeachersActive()
  })

  it('swallows a write failure so the mutation that triggered it still succeeds', async () => {
    vi.mocked(prisma.notification.findMany).mockResolvedValue([])
    vi.mocked(prisma.notification.createMany).mockRejectedValue(new Error('db down'))

    await expect(
      notifyQuietly({
        type: 'schedule-created',
        recipientIds: [1],
        actorId: 2,
        actorName: 'A B',
        params: { className: '1AHIT' },
      }),
    ).resolves.toBeUndefined()
  })
})

describe('classAudience', () => {
  beforeEach(() => vi.clearAllMocks())

  it('unions assignment holders, rotation holders and both class leads', async () => {
    vi.mocked(prisma.teacherAssignment.findMany).mockResolvedValue([
      { teacherId: 1 },
      { teacherId: 2 },
    ] as never)
    vi.mocked(prisma.teacherRotation.findMany).mockResolvedValue([{ teacherId: 3 }] as never)
    vi.mocked(prisma.class.findUnique).mockResolvedValue({
      classLeadId: 4,
      classHeadId: 5,
    } as never)

    expect(await classAudience(1, 1)).toEqual([1, 2, 3, 4, 5])
  })

  it('copes with a class that has neither lead nor head', async () => {
    vi.mocked(prisma.teacherAssignment.findMany).mockResolvedValue([{ teacherId: 1 }] as never)
    vi.mocked(prisma.teacherRotation.findMany).mockResolvedValue([] as never)
    vi.mocked(prisma.class.findUnique).mockResolvedValue({
      classLeadId: null,
      classHeadId: null,
    } as never)

    expect(await classAudience(1, 1)).toEqual([1])
  })
})
