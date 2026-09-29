import { beforeEach, describe, expect, test, vi } from 'vitest'
import { GET, POST } from '../route'
import { DELETE } from '../[id]/route'
import { POST as SHARE, DELETE as UNSHARE } from '../[id]/share/route'
import { prisma } from '@/lib/prisma'
import { resolveSessionTeacher } from '@/lib/session-teacher'
import { listTeacherCriteria, saveTeacherCriteria } from '@/lib/grading-criteria'

vi.mock('next-auth', () => ({
  getServerSession: vi.fn(async () => ({
    user: { name: 'max.mustermann', role: 'teacher' },
    expires: '2999-01-01',
  })),
}))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/school-year', () => ({ resolveSchoolYearId: vi.fn(async () => 2026) }))
vi.mock('@/lib/session-teacher', () => ({ resolveSessionTeacher: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: { gradingCriteria: { deleteMany: vi.fn(), updateMany: vi.fn() } },
}))
vi.mock('@/lib/grading-criteria', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/grading-criteria')>()),
  listTeacherCriteria: vi.fn(async () => ({ teacherName: 'Max', templates: [], classes: [] })),
  saveTeacherCriteria: vi.fn(async () => 7),
  newShareToken: vi.fn(() => 'tok'),
}))

const teacher = { id: 3, firstName: 'Max', lastName: 'Mustermann' }
const params = (id: string) => ({ params: Promise.resolve({ id }) })
const post = (body: unknown) =>
  new Request('http://localhost/api/grading-criteria', {
    method: 'POST',
    body: JSON.stringify(body),
  })

describe('/api/grading-criteria', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(resolveSessionTeacher).mockResolvedValue(teacher as never)
  })

  test('GET lists the session teacher’s templates', async () => {
    const res = await GET(new Request('http://localhost/api/grading-criteria'))
    expect(res.status).toBe(200)
    expect(listTeacherCriteria).toHaveBeenCalledWith(teacher, 2026)
  })

  test('403 without a teacher profile', async () => {
    vi.mocked(resolveSessionTeacher).mockResolvedValue(null)
    expect((await GET(new Request('http://localhost/api/grading-criteria'))).status).toBe(403)
  })

  test('POST validates and saves for the session teacher', async () => {
    const res = await POST(post({ title: 'Werkstätte', content: {} }))
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ id: 7 })
    expect(saveTeacherCriteria).toHaveBeenCalledWith(
      3,
      null,
      expect.objectContaining({ title: 'Werkstätte', isDefault: false, classIds: [] }),
    )
  })

  test('POST rejects a missing title', async () => {
    expect((await POST(post({ title: ' ', content: {} }))).status).toBe(400)
    expect(saveTeacherCriteria).not.toHaveBeenCalled()
  })

  test("DELETE is scoped to the teacher's own templates", async () => {
    vi.mocked(prisma.gradingCriteria.deleteMany).mockResolvedValue({ count: 0 })
    const res = await DELETE(new Request('http://localhost'), params('5'))
    expect(res.status).toBe(404)
    expect(prisma.gradingCriteria.deleteMany).toHaveBeenCalledWith({
      where: { id: 5, teacherId: 3 },
    })
  })

  test('share link is created and revoked on own templates only', async () => {
    vi.mocked(prisma.gradingCriteria.updateMany).mockResolvedValue({ count: 1 })
    const created = await SHARE(new Request('http://localhost'), params('5'))
    expect(await created.json()).toEqual({ shareToken: 'tok' })
    expect(prisma.gradingCriteria.updateMany).toHaveBeenCalledWith({
      where: { id: 5, teacherId: 3 },
      data: { shareToken: 'tok' },
    })

    vi.mocked(prisma.gradingCriteria.updateMany).mockResolvedValue({ count: 0 })
    expect((await UNSHARE(new Request('http://localhost'), params('5'))).status).toBe(404)
  })
})
