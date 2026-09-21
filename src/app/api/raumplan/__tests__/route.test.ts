import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GET } from '../route'
import { GET as STUDENT_GET } from '../student/route'
import { GET as ME_GET } from '../me/route'
import * as query from '@/lib/raumplan/query'
import { resolveSchoolYearId } from '@/lib/school-year'
import { resolveSessionStudent } from '@/lib/session-student'
import { prisma } from '@/lib/prisma'

// api-guard is globally mocked to "allowed" in vitest.setup.ts, so these tests
// exercise handler logic, not auth (the policy itself is tested elsewhere).
// The global api-guard mock resolves the session via getServerSession; the /me
// route uses requireAccess, so provide one. Its content is irrelevant here —
// resolveSessionStudent is mocked separately.
vi.mock('next-auth', () => ({
  getServerSession: vi.fn(async () => ({ user: { role: 'student' } })),
}))
vi.mock('@/lib/school-year', () => ({ resolveSchoolYearId: vi.fn() }))
vi.mock('@/lib/sentry', () => ({ captureError: vi.fn() }))
vi.mock('@/lib/session-student', () => ({ resolveSessionStudent: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: { class: { findUnique: vi.fn() } } }))
vi.mock('@/lib/raumplan/query', () => ({
  getWeekOccupancy: vi.fn(),
  getStudentPlacement: vi.fn(),
  getStudentSelfPlacement: vi.fn(),
  getInvariantViolations: vi.fn(),
}))

const req = (url: string) => new Request(`http://localhost${url}`)

describe('GET /api/raumplan', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(resolveSchoolYearId as ReturnType<typeof vi.fn>).mockResolvedValue(1)
  })
  afterEach(() => vi.restoreAllMocks())

  it('returns the week occupancy grid', async () => {
    const occ = { schoolYearId: 1, reference: '15.09.25', weekDates: {}, cells: [] }
    ;(query.getWeekOccupancy as ReturnType<typeof vi.fn>).mockResolvedValue(occ)

    const res = await GET(req('/api/raumplan?week=15.09.25'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(occ)
    expect(query.getWeekOccupancy).toHaveBeenCalledWith('15.09.25', 1)
  })

  it('returns invariant violations when check=invariant', async () => {
    ;(query.getInvariantViolations as ReturnType<typeof vi.fn>).mockResolvedValue([])
    const res = await GET(req('/api/raumplan?check=invariant'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ schoolYearId: 1, violations: [] })
    expect(query.getWeekOccupancy).not.toHaveBeenCalled()
  })

  it('400s when no school year resolves', async () => {
    ;(resolveSchoolYearId as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    const res = await GET(req('/api/raumplan'))
    expect(res.status).toBe(400)
  })

  it('500s when resolution throws', async () => {
    ;(query.getWeekOccupancy as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('boom'))
    const res = await GET(req('/api/raumplan'))
    expect(res.status).toBe(500)
  })
})

describe('GET /api/raumplan/student', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(resolveSchoolYearId as ReturnType<typeof vi.fn>).mockResolvedValue(1)
  })
  afterEach(() => vi.restoreAllMocks())

  it('requires studentId', async () => {
    const res = await STUDENT_GET(req('/api/raumplan/student'))
    expect(res.status).toBe(400)
  })

  it('400s on a non-numeric studentId', async () => {
    const res = await STUDENT_GET(req('/api/raumplan/student?studentId=abc'))
    expect(res.status).toBe(400)
  })

  it('returns the placement for a student', async () => {
    const result = {
      student: { id: 7, name: 'Max M', className: '1AHET', groupId: 1 },
      date: '15.09.25',
      weekday: 1,
      periods: [],
    }
    ;(query.getStudentPlacement as ReturnType<typeof vi.fn>).mockResolvedValue(result)
    const res = await STUDENT_GET(req('/api/raumplan/student?studentId=7&date=15.09.25'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(result)
    expect(query.getStudentPlacement).toHaveBeenCalledWith(7, '15.09.25', 1)
  })

  it('404s when the student is not found', async () => {
    ;(query.getStudentPlacement as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    const res = await STUDENT_GET(req('/api/raumplan/student?studentId=999'))
    expect(res.status).toBe(404)
  })
})

describe('GET /api/raumplan/me', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(resolveSchoolYearId as ReturnType<typeof vi.fn>).mockResolvedValue(1)
  })
  afterEach(() => vi.restoreAllMocks())

  it('resolves the signed-in student from the session (no studentId param)', async () => {
    ;(resolveSessionStudent as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 7,
      firstName: 'Max',
      lastName: 'Mustermann',
      classId: 10,
      groupId: 1,
    })
    ;(prisma.class.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ name: '1AHET' })
    const result = {
      student: { id: 7 },
      date: '22.09.25',
      weekday: 1,
      isToday: true,
      hasUpcoming: true,
      periods: [],
    }
    ;(query.getStudentSelfPlacement as ReturnType<typeof vi.fn>).mockResolvedValue(result)

    const res = await ME_GET(req('/api/raumplan/me'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(result)
    // className resolved and passed through; date param defaults to null.
    expect(query.getStudentSelfPlacement).toHaveBeenCalledWith(
      expect.objectContaining({ id: 7, classId: 10, className: '1AHET' }),
      null,
      1,
    )
  })

  it('404s when the session has no student profile', async () => {
    ;(resolveSessionStudent as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    const res = await ME_GET(req('/api/raumplan/me'))
    expect(res.status).toBe(404)
    expect(query.getStudentSelfPlacement).not.toHaveBeenCalled()
  })

  it('404s when the resolved student has no class', async () => {
    ;(resolveSessionStudent as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 7,
      firstName: 'Max',
      lastName: 'M',
      classId: null,
      groupId: null,
    })
    const res = await ME_GET(req('/api/raumplan/me'))
    expect(res.status).toBe(404)
  })
})
