import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { GET } from '../route'
import { POST } from '../acknowledge/route'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    teacher: { findUnique: vi.fn() },
    notification: { findMany: vi.fn(), updateMany: vi.fn(), count: vi.fn() },
    sokratesChangeNotice: { updateMany: vi.fn() },
  },
}))

vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/sentry', () => ({ captureError: vi.fn() }))

const signInAs = (username: string | null) =>
  vi
    .mocked(getServerSession)
    .mockResolvedValue(
      username === null ? null : ({ user: { name: username, role: 'teacher' } } as never),
    )

const teacherRow = { id: 7, firstName: 'Anna', lastName: 'Berger' }

describe('GET /api/notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    signInAs('anna.berger')
    vi.mocked(prisma.teacher.findUnique).mockResolvedValue(teacherRow as never)
    vi.mocked(prisma.notification.count).mockResolvedValue(1 as never)
  })

  it("returns the caller's rows with an unread count", async () => {
    vi.mocked(prisma.notification.findMany).mockResolvedValue([
      {
        id: 1,
        type: 'schedule-updated',
        params: { className: '1AHIT' },
        link: '/schedules?class=1AHIT',
        actorName: 'Max Muster',
        createdAt: new Date('2026-03-01T08:00:00.000Z'),
        readAt: null,
      },
      {
        id: 2,
        type: 'grades-entered',
        params: { className: '1AHIT', count: 3 },
        link: null,
        actorName: 'Max Muster',
        createdAt: new Date('2026-02-01T08:00:00.000Z'),
        readAt: new Date('2026-02-02T08:00:00.000Z'),
      },
    ] as never)

    const data = await (await GET()).json()

    expect(data.unreadCount).toBe(1)
    expect(data.notifications).toEqual([
      expect.objectContaining({ id: 1, type: 'schedule-updated', read: false }),
      expect.objectContaining({ id: 2, type: 'grades-entered', read: true }),
    ])
    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { recipientId: 7 } }),
    )
  })

  it('reports the true unread backlog, not just what fits on the page', async () => {
    // The window is unread-first, so past its size every row in it is unread and
    // deriving the badge from the page would peg it at the page size.
    vi.mocked(prisma.notification.findMany).mockResolvedValue(
      Array.from({ length: 100 }, (_, i) => ({
        id: i + 1,
        type: 'schedule-updated',
        params: { className: '1AHIT' },
        link: null,
        actorName: 'Max Muster',
        createdAt: new Date('2026-03-01T08:00:00.000Z'),
        readAt: null,
      })) as never,
    )
    vi.mocked(prisma.notification.count).mockResolvedValue(137 as never)

    const data = await (await GET()).json()

    expect(data.notifications).toHaveLength(100)
    expect(data.unreadCount).toBe(137)
    expect(prisma.notification.count).toHaveBeenCalledWith({
      where: { recipientId: 7, readAt: null },
    })
  })

  it('is empty rather than an error for an admin with no Teacher row', async () => {
    vi.mocked(prisma.teacher.findUnique).mockResolvedValue(null as never)

    const data = await (await GET()).json()

    expect(data).toEqual({ notifications: [], unreadCount: 0 })
    expect(prisma.notification.findMany).not.toHaveBeenCalled()
  })
})

describe('POST /api/notifications/acknowledge', () => {
  const request = (body: unknown) =>
    new Request('http://localhost/api/notifications/acknowledge', {
      method: 'POST',
      body: JSON.stringify(body),
    })

  beforeEach(() => {
    vi.clearAllMocks()
    signInAs('anna.berger')
    vi.mocked(prisma.teacher.findUnique).mockResolvedValue(teacherRow as never)
    vi.mocked(prisma.notification.findMany).mockResolvedValue([] as never)
    vi.mocked(prisma.notification.updateMany).mockResolvedValue({ count: 1 } as never)
    vi.mocked(prisma.sokratesChangeNotice.updateMany).mockResolvedValue({ count: 0 } as never)
  })

  it('scopes a single acknowledgement to the caller', async () => {
    const response = await POST(request({ id: 5 }))

    expect(response.status).toBe(200)
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { id: 5, recipientId: 7, readAt: null },
      data: { readAt: expect.any(Date) },
    })
  })

  it('acknowledges everything unread when asked for all', async () => {
    await POST(request({ all: true }))

    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { recipientId: 7, readAt: null },
      data: { readAt: expect.any(Date) },
    })
  })

  it('rejects a body with neither an id nor all', async () => {
    const response = await POST(request({}))

    expect(response.status).toBe(400)
    expect(prisma.notification.updateMany).not.toHaveBeenCalled()
  })

  it('resolves the Sokrates notices a sokrates-change entry stands for', async () => {
    vi.mocked(prisma.notification.findMany).mockResolvedValue([
      {
        type: 'sokrates-change',
        params: { classId: 3, schoolYearId: 2, semester: 'first', className: '1AHIT', count: 2 },
      },
    ] as never)

    await POST(request({ id: 5 }))

    expect(prisma.sokratesChangeNotice.updateMany).toHaveBeenCalledWith({
      where: {
        classId: 3,
        schoolYearId: 2,
        semester: 'first',
        recipientId: 7,
        acknowledgedAt: null,
      },
      data: { acknowledgedAt: expect.any(Date) },
    })
  })

  it('leaves the Sokrates notices alone for other notification types', async () => {
    vi.mocked(prisma.notification.findMany).mockResolvedValue([
      { type: 'schedule-updated', params: { className: '1AHIT' } },
    ] as never)

    await POST(request({ id: 5 }))

    expect(prisma.sokratesChangeNotice.updateMany).not.toHaveBeenCalled()
  })

  it('ignores a sokrates-change entry whose params lost their scope', async () => {
    vi.mocked(prisma.notification.findMany).mockResolvedValue([
      { type: 'sokrates-change', params: { className: '1AHIT' } },
    ] as never)

    await POST(request({ id: 5 }))

    expect(prisma.sokratesChangeNotice.updateMany).not.toHaveBeenCalled()
  })

  it('still reports success when resolving the linked notices fails', async () => {
    // The acknowledgement has already committed; a 500 here would claim a
    // dismissal failed that the user can see took effect.
    vi.mocked(prisma.notification.findMany).mockResolvedValue([
      {
        type: 'sokrates-change',
        params: { classId: 3, schoolYearId: 2, semester: 'first', className: '1AHIT', count: 2 },
      },
    ] as never)
    vi.mocked(prisma.sokratesChangeNotice.updateMany).mockRejectedValue(new Error('db down'))

    const response = await POST(request({ id: 5 }))

    expect(response.status).toBe(200)
    expect(prisma.notification.updateMany).toHaveBeenCalled()
  })

  it('refuses a signed-in user with no Teacher row', async () => {
    vi.mocked(prisma.teacher.findUnique).mockResolvedValue(null as never)

    const response = await POST(request({ all: true }))

    expect(response.status).toBe(404)
    expect(prisma.notification.updateMany).not.toHaveBeenCalled()
  })
})
