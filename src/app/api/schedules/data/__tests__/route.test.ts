import { describe, test, expect, vi, beforeEach } from 'vitest'
import { getServerSession } from 'next-auth'
import { GET } from '../route'
import { prisma } from '@/lib/prisma'
import { captureError } from '@/lib/sentry'
import { resolveSessionTeacher } from '@/lib/session-teacher'
import {
  makeClass,
  makeClassMembership,
  makeSchedule,
  makeSchoolYear,
  makeStudent,
  makeTeacher,
  makeTeacherAssignment,
  makeTeacherRotation,
} from '@/test/fixtures'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    teacher: { findUnique: vi.fn() },
    teacherAssignment: { findMany: vi.fn() },
    teacherRotation: { findMany: vi.fn() },
    class: { findUnique: vi.fn() },
    schedule: { findFirst: vi.fn() },
    schoolYear: { findFirst: vi.fn() },
    classMembership: { findMany: vi.fn() },
    student: { findMany: vi.fn() },
  },
}))
vi.mock('@/lib/sentry', () => ({ captureError: vi.fn() }))
// The route falls back to the session resolver only when the username misses;
// these tests drive the username path, so a null session skips the fallback.
vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => null) }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/session-teacher', () => ({ resolveSessionTeacher: vi.fn(async () => null) }))

describe('Schedule Data API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.schoolYear.findFirst).mockResolvedValue(makeSchoolYear({ id: 1 }))
    vi.mocked(prisma.classMembership.findMany).mockResolvedValue([])
  })

  test('should return 400 if teacher username is missing', async () => {
    const req = new Request('http://localhost/api/schedules/data')
    const res = await GET(req)
    const data = await res.json()
    expect(res.status).toBe(400)
    expect(data).toEqual({ error: 'Teacher username is required' })
  })

  test('should return 200 if teacher not found', async () => {
    vi.mocked(prisma.teacher.findUnique).mockResolvedValue(null)
    const req = new Request('http://localhost/api/schedules/data?teacher=foo')
    const res = await GET(req)
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data).toEqual({ error: 'Teacher not found' })
  })

  test('resolves via the session when the requested teacher is the signed-in user', async () => {
    // The username lookup misses (display name != stored username)...
    vi.mocked(prisma.teacher.findUnique).mockResolvedValue(null)
    // ...but the requested name is the signed-in user's own, so the fallback runs.
    vi.mocked(getServerSession).mockResolvedValue({
      user: { name: 'foo' },
      expires: '2999-01-01',
    } as never)
    vi.mocked(resolveSessionTeacher).mockResolvedValue(
      makeTeacher({ id: 1, firstName: 'T', lastName: 'E', username: 'foo.bar' }),
    )
    vi.mocked(prisma.teacherAssignment.findMany).mockResolvedValue([])

    const req = new Request('http://localhost/api/schedules/data?teacher=foo')
    const res = await GET(req)
    const data = await res.json()

    expect(resolveSessionTeacher).toHaveBeenCalledOnce()
    // Teacher resolved, so we get past the "not found" branch.
    expect(data).not.toEqual({ error: 'Teacher not found' })
  })

  test('does not resolve via the session for a different teacher', async () => {
    vi.mocked(prisma.teacher.findUnique).mockResolvedValue(null)
    // Signed in as someone else than the requested ?teacher=foo.
    vi.mocked(getServerSession).mockResolvedValue({
      user: { name: 'someone.else' },
      expires: '2999-01-01',
    } as never)

    const req = new Request('http://localhost/api/schedules/data?teacher=foo')
    const res = await GET(req)
    const data = await res.json()

    // The caller resolves to no teacher, so the username fallback cannot bind to
    // a different teacher and no other teacher's data leaks.
    expect(data).toEqual({ error: 'Teacher not found' })
  })

  test('forbids a non-admin caller from reading another teacher by username', async () => {
    // The requested teacher exists, but the caller resolves to a different
    // teacher and is not an admin, so the ownership gate must return 403.
    vi.mocked(getServerSession).mockResolvedValue({
      user: { name: 'someone.else', role: 'teacher' },
      expires: '2999-01-01',
    } as never)
    vi.mocked(prisma.teacher.findUnique).mockResolvedValue(
      makeTeacher({ id: 1, firstName: 'T', lastName: 'E', username: 'foo' }),
    )
    vi.mocked(resolveSessionTeacher).mockResolvedValue(
      makeTeacher({ id: 2, firstName: 'O', lastName: 'E', username: 'someone.else' }),
    )

    const req = new Request('http://localhost/api/schedules/data?teacher=foo')
    const res = await GET(req)
    const data = await res.json()

    expect(res.status).toBe(403)
    expect(data).toEqual({ error: 'Forbidden' })
    // No roster query should run once the caller fails the ownership check.
    expect(prisma.student.findMany).not.toHaveBeenCalled()
  })

  test('should return 200 if no assignments for teacher', async () => {
    // Admin session so the caller-owns-teacher gate is satisfied and the
    // handler's data-shaping logic is exercised.
    vi.mocked(getServerSession).mockResolvedValue({
      user: { name: 'admin', role: 'admin' },
      expires: '2999-01-01',
    } as never)
    vi.mocked(prisma.teacher.findUnique).mockResolvedValue(
      makeTeacher({ id: 1, firstName: 'T', lastName: 'E', username: 'foo' }),
    )
    vi.mocked(prisma.teacherAssignment.findMany).mockResolvedValue([])
    const req = new Request('http://localhost/api/schedules/data?teacher=foo')
    const res = await GET(req)
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data).toEqual({ error: 'No classes assigned to teacher' })
  })

  test('should return 200 if no teacher rotation found', async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { name: 'admin', role: 'admin' },
      expires: '2999-01-01',
    } as never)
    vi.mocked(prisma.teacher.findUnique).mockResolvedValue(
      makeTeacher({ id: 1, firstName: 'T', lastName: 'E', username: 'foo' }),
    )
    vi.mocked(prisma.teacherAssignment.findMany).mockResolvedValue([makeTeacherAssignment()])
    vi.mocked(prisma.teacherRotation.findMany).mockResolvedValue([])
    const req = new Request('http://localhost/api/schedules/data?teacher=foo')
    const res = await GET(req)
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data).toEqual({ error: 'No teacher rotation found' })
  })

  test('should return 200 if no students found', async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { name: 'admin', role: 'admin' },
      expires: '2999-01-01',
    } as never)
    vi.mocked(prisma.teacher.findUnique).mockResolvedValue(
      makeTeacher({ id: 1, firstName: 'T', lastName: 'E', username: 'foo' }),
    )
    vi.mocked(prisma.teacherAssignment.findMany).mockResolvedValue([makeTeacherAssignment()])
    vi.mocked(prisma.teacherRotation.findMany).mockResolvedValue([makeTeacherRotation()])
    vi.mocked(prisma.class.findUnique).mockResolvedValue(makeClass({ id: 1, name: '1A' }))
    // The route selects relations alongside the row, which the generated
    // findFirst type does not describe, hence the cast.
    vi.mocked(prisma.schedule.findFirst).mockResolvedValue({
      ...makeSchedule({
        id: 1,
        name: 'Schedule',
        classId: 1,
        selectedWeekday: 0,
        scheduleData: {},
      }),
      breakTimes: [],
      scheduleTimes: [],
      turns: [],
    } as unknown as Awaited<ReturnType<typeof prisma.schedule.findFirst>>)
    vi.mocked(prisma.student.findMany).mockResolvedValue([])
    const req = new Request('http://localhost/api/schedules/data?teacher=foo')
    const res = await GET(req)
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data).toEqual({ error: 'No students found' })
  })

  test('should return 200 and correct structure if all data is present', async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { name: 'admin', role: 'admin' },
      expires: '2999-01-01',
    } as never)
    vi.mocked(prisma.teacher.findUnique).mockResolvedValue(
      makeTeacher({ id: 1, firstName: 'T', lastName: 'E', username: 'foo' }),
    )
    vi.mocked(prisma.teacherAssignment.findMany).mockResolvedValue([makeTeacherAssignment()])
    vi.mocked(prisma.teacherRotation.findMany).mockResolvedValue([makeTeacherRotation()])
    vi.mocked(prisma.class.findUnique).mockResolvedValue(makeClass({ id: 1, name: '1A' }))
    // The route selects relations alongside the row, which the generated
    // findFirst type does not describe, hence the cast.
    vi.mocked(prisma.schedule.findFirst).mockResolvedValue({
      ...makeSchedule({
        id: 1,
        name: 'Schedule',
        classId: 1,
        selectedWeekday: 0,
        scheduleData: {},
      }),
      breakTimes: [],
      scheduleTimes: [],
      turns: [],
    } as unknown as Awaited<ReturnType<typeof prisma.schedule.findFirst>>)
    vi.mocked(prisma.classMembership.findMany).mockResolvedValue([
      makeClassMembership({ studentId: 1 }),
    ])
    vi.mocked(prisma.student.findMany).mockResolvedValue([
      makeStudent({
        id: 1,
        firstName: 'S',
        lastName: 'T',
        username: 'student',
        classId: 1,
        groupId: 1,
      }),
    ])
    const req = new Request('http://localhost/api/schedules/data?teacher=foo')
    const res = await GET(req)
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data).toHaveProperty('schedules')
    expect(data).toHaveProperty('students')
    expect(data).toHaveProperty('teacherRotation')
    expect(data).toHaveProperty('assignments')
    expect(data).toHaveProperty('classdata')
  })

  test('should return 500 and call captureError on unexpected error', async () => {
    vi.mocked(prisma.teacher.findUnique).mockRejectedValue(new Error('DB error'))
    const req = new Request('http://localhost/api/schedules/data?teacher=foo')
    const res = await GET(req)
    const data = await res.json()
    expect(res.status).toBe(500)
    expect(data).toEqual({ error: 'Internal server error' })
    expect(captureError).toHaveBeenCalled()
  })
})
