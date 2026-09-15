import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { resolveSessionTeacher } from '@/lib/session-teacher'
import { POST, DELETE } from '../route'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    pushToken: { upsert: vi.fn(), deleteMany: vi.fn() },
  },
}))

vi.mock('@/lib/session-teacher', () => ({ resolveSessionTeacher: vi.fn() }))
vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))

const req = (body: unknown) => new Request('http://t/api/push/register', { method: 'POST', body: JSON.stringify(body) })
const teacherRow = { id: 7, firstName: 'Anna', lastName: 'Berger' }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getServerSession).mockResolvedValue({ user: { name: 'anna.berger', role: 'teacher' } } as never)
})

describe('POST /api/push/register', () => {
  it('upserts the token for the resolved teacher', async () => {
    vi.mocked(resolveSessionTeacher).mockResolvedValue(teacherRow as never)

    const res = await POST(req({ token: 'ExponentPushToken[abc]', platform: 'ios' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, stored: true })

    expect(prisma.pushToken.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { token: 'ExponentPushToken[abc]' },
        create: expect.objectContaining({ token: 'ExponentPushToken[abc]', teacherId: 7, platform: 'ios' }),
      }),
    )
  })

  it('no-ops (stored:false) when the caller has no Teacher row', async () => {
    vi.mocked(resolveSessionTeacher).mockResolvedValue(null)

    const res = await POST(req({ token: 'ExponentPushToken[abc]' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, stored: false })
    expect(prisma.pushToken.upsert).not.toHaveBeenCalled()
  })

  it('rejects a missing token with 400', async () => {
    vi.mocked(resolveSessionTeacher).mockResolvedValue(teacherRow as never)
    const res = await POST(req({ platform: 'ios' }))
    expect(res.status).toBe(400)
    expect(prisma.pushToken.upsert).not.toHaveBeenCalled()
  })
})

describe('DELETE /api/push/register', () => {
  it('removes the token scoped to the caller', async () => {
    vi.mocked(resolveSessionTeacher).mockResolvedValue(teacherRow as never)

    const res = await DELETE(
      new Request('http://t/api/push/register', { method: 'DELETE', body: JSON.stringify({ token: 'ExponentPushToken[abc]' }) }),
    )
    expect(res.status).toBe(204)
    expect(prisma.pushToken.deleteMany).toHaveBeenCalledWith({
      where: { token: 'ExponentPushToken[abc]', teacherId: 7 },
    })
  })
})
