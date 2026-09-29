import { beforeEach, describe, expect, test, vi } from 'vitest'
import { GET } from '../route'
import { prisma } from '@/lib/prisma'
import { resolveSessionStudent } from '@/lib/session-student'
import { planClassIdsFor } from '@/lib/weekday-groups'
import { makeStudent } from '@/test/fixtures'

vi.mock('@/lib/weekday-groups', () => import('@/test/weekday-groups-passthrough'))
vi.mock('@/lib/combined-classes', () => ({
  resolveMemberClassIds: vi.fn(async (id: number) => (id === 99 ? [10, 11] : [id])),
}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    class: { findUnique: vi.fn() },
    student: { findMany: vi.fn() },
  },
}))
vi.mock('next-auth', () => ({
  getServerSession: vi.fn(async () => ({
    user: { name: 'anna.a', role: 'student' },
    expires: '2999-01-01',
  })),
}))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/session-student', () => ({ resolveSessionStudent: vi.fn(async () => null) }))

const request = (cls: string) =>
  new Request(`http://localhost/api/me/plan-roster?class=${encodeURIComponent(cls)}`)

describe('GET /api/me/plan-roster', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(resolveSessionStudent).mockResolvedValue(makeStudent({ id: 1, classId: 10 }))
  })

  test('returns the roster of a combined class spanning the student, names only', async () => {
    vi.mocked(planClassIdsFor).mockResolvedValue([10, 99])
    vi.mocked(prisma.class.findUnique).mockResolvedValue({ id: 99, isCombined: true } as never)
    vi.mocked(prisma.student.findMany).mockResolvedValue([
      { id: 1, firstName: 'Anna', lastName: 'A', class: { name: '3AHET' } },
      { id: 2, firstName: 'Ben', lastName: 'B', class: { name: '3BHET' } },
    ] as never)

    const res = await GET(request('3AHET+3BHET'))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([
      { id: 1, firstName: 'Anna', lastName: 'A', class: '3AHET', originalClass: '3AHET' },
      { id: 2, firstName: 'Ben', lastName: 'B', class: '3BHET', originalClass: '3BHET' },
    ])
    expect(prisma.student.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { classId: { in: [10, 11] } } }),
    )
  })

  test("forbids a class the student's plans do not include", async () => {
    vi.mocked(prisma.class.findUnique).mockResolvedValue({ id: 20, isCombined: false } as never)

    const res = await GET(request('4AHET'))

    expect(res.status).toBe(403)
    expect(prisma.student.findMany).not.toHaveBeenCalled()
  })

  test('404s a session with no student profile', async () => {
    vi.mocked(resolveSessionStudent).mockResolvedValue(null)
    expect((await GET(request('3AHET'))).status).toBe(404)
  })
})
