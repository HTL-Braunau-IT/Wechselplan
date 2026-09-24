import { beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '@/lib/prisma'
import { GET, POST } from '../route'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    class: { findUnique: vi.fn() },
    student: { findMany: vi.fn(), updateMany: vi.fn() },
    groupAssignment: { findMany: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
    studentWeekdayGroup: {
      findMany: vi.fn(),
      deleteMany: vi.fn(() => 'delete-op'),
      createMany: vi.fn(() => 'create-op'),
    },
    $transaction: vi.fn(async (ops: unknown) => ops),
  },
}))
vi.mock('@/lib/sentry', () => ({ captureError: vi.fn() }))
vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => null) }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/combined-classes', () => ({
  resolveMemberClassIds: vi.fn(async (id: number) => [id]),
}))
vi.mock('@/lib/school-year', () => ({ resolveSchoolYearId: vi.fn(async () => 9) }))
vi.mock('@/lib/current-teacher', () => ({ resolveCurrentTeacher: vi.fn(async () => null) }))
vi.mock('@/lib/notifications', () => ({ bestEffort: vi.fn() }))
vi.mock('../../_notify', () => ({ notifyScheduleChange: vi.fn() }))

const roster = [
  { id: 1, firstName: 'A', lastName: 'A', groupId: 1 },
  { id: 2, firstName: 'B', lastName: 'B', groupId: 1 },
  { id: 3, firstName: 'C', lastName: 'C', groupId: 2 },
]

const get = (query: string) =>
  GET(new Request(`http://localhost/api/schedules/assignments?classId=4&${query}`))

describe('per-weekday groups (/api/schedules/assignments)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.class.findUnique).mockResolvedValue({ id: 4, name: '2AHITS' } as never)
    vi.mocked(prisma.student.findMany).mockResolvedValue(roster as never)
  })

  it("returns the requested day's own grouping, not Student.groupId", async () => {
    vi.mocked(prisma.studentWeekdayGroup.findMany).mockResolvedValue([
      { studentId: 1, groupId: 2, selectedWeekday: 3 },
      { studentId: 2, groupId: 1, selectedWeekday: 3 },
      { studentId: 3, groupId: 1, selectedWeekday: 3 },
    ] as never)

    const data = await (await get('weekday=3')).json()

    expect(data.assignments).toEqual([
      { groupId: 1, studentIds: [2, 3] },
      { groupId: 2, studentIds: [1] },
    ])
    expect(data.unassignedStudents).toEqual([])
    expect(data.seededFromWeekday).toBeNull()
  })

  it('seeds a day without groups from the earliest other day', async () => {
    vi.mocked(prisma.studentWeekdayGroup.findMany).mockResolvedValue([
      { studentId: 1, groupId: 2, selectedWeekday: 1 },
      { studentId: 3, groupId: 1, selectedWeekday: 1 },
    ] as never)

    const data = await (await get('weekday=4')).json()

    expect(data.seededFromWeekday).toBe(1)
    expect(data.assignments).toEqual([
      { groupId: 1, studentIds: [3] },
      { groupId: 2, studentIds: [1] },
    ])
    expect(data.unassignedStudents.map((s: { id: number }) => s.id)).toEqual([2])
  })

  it('seeds a class never grouped per day from Student.groupId', async () => {
    vi.mocked(prisma.studentWeekdayGroup.findMany).mockResolvedValue([])

    const data = await (await get('weekday=2')).json()

    expect(data.seededFromWeekday).toBeNull()
    expect(data.assignments).toEqual([
      { groupId: 1, studentIds: [1, 2] },
      { groupId: 2, studentIds: [3] },
    ])
  })

  it("replaces only that day's rows and leaves Student.groupId alone", async () => {
    vi.mocked(prisma.student.findMany).mockResolvedValue([{ id: 1 }, { id: 2 }] as never)

    const res = await POST(
      new Request('http://localhost/api/schedules/assignments', {
        method: 'POST',
        body: JSON.stringify({
          classId: 4,
          weekday: 3,
          schoolYearId: 9,
          assignments: [
            { groupId: 0, studentIds: [2] }, // unassigned → no row
            { groupId: 1, studentIds: [1, 77] }, // 77 is not on the roster
          ],
        }),
      }),
    )

    expect(res.status).toBe(200)
    expect(prisma.studentWeekdayGroup.deleteMany).toHaveBeenCalledWith({
      where: { classId: 4, schoolYearId: 9, selectedWeekday: 3 },
    })
    expect(prisma.studentWeekdayGroup.createMany).toHaveBeenCalledWith({
      data: [{ studentId: 1, classId: 4, schoolYearId: 9, selectedWeekday: 3, groupId: 1 }],
      skipDuplicates: true,
    })
    expect(prisma.student.updateMany).not.toHaveBeenCalled()
    expect(prisma.groupAssignment.upsert).not.toHaveBeenCalled()
  })
})
