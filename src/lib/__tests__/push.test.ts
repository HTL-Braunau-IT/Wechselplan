import { beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '@/lib/prisma'
import { sendPushToTeachers } from '@/lib/push'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    pushToken: { findMany: vi.fn(), deleteMany: vi.fn() },
  },
}))
vi.mock('@/lib/sentry', () => ({ captureError: vi.fn() }))

const okResponse = (data: unknown) =>
  ({ ok: true, status: 200, json: async () => ({ data }) }) as unknown as Response

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', vi.fn())
})

describe('sendPushToTeachers', () => {
  it('does nothing when there are no tokens', async () => {
    vi.mocked(prisma.pushToken.findMany).mockResolvedValue([] as never)
    await sendPushToTeachers([1, 2], { title: 'T', body: 'B' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('chunks tokens into batches of 100', async () => {
    const rows = Array.from({ length: 150 }, (_, i) => ({ token: `t${i}` }))
    vi.mocked(prisma.pushToken.findMany).mockResolvedValue(rows as never)
    vi.mocked(fetch).mockResolvedValue(okResponse(rows.slice(0, 100).map(() => ({ status: 'ok' }))))

    await sendPushToTeachers([1], { title: 'T', body: 'B' })

    expect(fetch).toHaveBeenCalledTimes(2)
    const firstBody = JSON.parse(vi.mocked(fetch).mock.calls[0]![1]!.body as string)
    expect(firstBody).toHaveLength(100)
    expect(firstBody[0]).toMatchObject({ to: 't0', title: 'T', body: 'B', sound: 'default' })
  })

  it('deletes tokens Expo reports as DeviceNotRegistered', async () => {
    vi.mocked(prisma.pushToken.findMany).mockResolvedValue([
      { token: 'good' },
      { token: 'dead' },
    ] as never)
    vi.mocked(fetch).mockResolvedValue(
      okResponse([
        { status: 'ok' },
        { status: 'error', details: { error: 'DeviceNotRegistered' } },
      ]),
    )

    await sendPushToTeachers([1], { title: 'T', body: 'B' })

    expect(prisma.pushToken.deleteMany).toHaveBeenCalledWith({ where: { token: { in: ['dead'] } } })
  })

  it('never throws when the fetch fails', async () => {
    vi.mocked(prisma.pushToken.findMany).mockResolvedValue([{ token: 'good' }] as never)
    vi.mocked(fetch).mockRejectedValue(new Error('network down'))
    await expect(sendPushToTeachers([1], { title: 'T', body: 'B' })).resolves.toBeUndefined()
    expect(prisma.pushToken.deleteMany).not.toHaveBeenCalled()
  })
})
