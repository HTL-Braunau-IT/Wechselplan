import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { resolveCurrentTeacher } from '@/lib/current-teacher'
import { notifyScheduleChange } from '@/app/api/schedules/_notify'
import { dropGroupsOutsideClass } from '@/lib/weekday-groups'
import { POST } from '../route'

vi.mock('@/lib/weekday-groups', () => import('@/test/weekday-groups-passthrough'))
vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/sentry', () => ({ captureError: vi.fn() }))
vi.mock('@/lib/current-teacher', () => ({ resolveCurrentTeacher: vi.fn() }))
vi.mock('@/app/api/schedules/_notify', () => ({ notifyScheduleChange: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    student: { findUnique: vi.fn(), update: vi.fn() },
    class: { findUnique: vi.fn() },
    schoolYear: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}))

const request = (body: unknown) =>
  new Request('http://localhost/api/students/5/transfer', {
    method: 'POST',
    body: JSON.stringify(body),
  }) as unknown as NextRequest

const context = { params: Promise.resolve({ id: '5' }) }

let lastTx: { studentWeekdayGroup: { upsert: ReturnType<typeof vi.fn> } } | undefined

describe('POST /api/students/[id]/transfer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getServerSession).mockResolvedValue({ user: { role: 'teacher' } } as never)
    vi.mocked(resolveCurrentTeacher).mockResolvedValue({ id: 7, name: 'Anna' } as never)
    // Student currently in class 1, moving to class 2.
    vi.mocked(prisma.student.findUnique).mockResolvedValue({ id: 5, classId: 1 } as never)
    vi.mocked(prisma.class.findUnique).mockResolvedValue({ id: 2, name: '2BHIT' } as never)
    vi.mocked(prisma.schoolYear.findUnique).mockResolvedValue({ id: 9 } as never)
    vi.mocked(prisma.$transaction).mockImplementation((async (
      fn: (tx: unknown) => Promise<unknown>,
    ) => {
      const tx = {
        student: { update: vi.fn() },
        classMembership: { upsert: vi.fn() },
        groupAssignment: { upsert: vi.fn() },
        studentWeekdayGroup: {
          // Class 2 already groups students into group 1 on Monday.
          findMany: vi.fn(async () => [{ selectedWeekday: 1 }]),
          upsert: vi.fn(),
        },
      }
      lastTx = tx
      return fn(tx)
    }) as never)
  })

  it('notifies both the source and the target class', async () => {
    const res = await POST(request({ targetClassId: 2, targetGroupId: 1, schoolYearId: 9 }), context)

    expect(res.status).toBe(200)
    expect(notifyScheduleChange).toHaveBeenCalledTimes(2)
    const notifiedClassIds = vi
      .mocked(notifyScheduleChange)
      .mock.calls.map(([arg]) => arg.classId)
      .sort()
    expect(notifiedClassIds).toEqual([1, 2])
    for (const [arg] of vi.mocked(notifyScheduleChange).mock.calls) {
      expect(arg.type).toBe('schedule-students-changed')
      expect(arg.schoolYearId).toBe(9)
    }
  })

  it('drops per-day groups outside the target class and places the student on each day', async () => {
    const res = await POST(
      request({ targetClassId: 2, targetGroupId: 1, schoolYearId: 9, weekday: 3 }),
      context,
    )

    expect(res.status).toBe(200)
    expect(dropGroupsOutsideClass).toHaveBeenCalledWith(expect.anything(), 5, 2)
    // Monday (where group 1 exists) and the transfer's own weekday, Wednesday.
    const days = lastTx!.studentWeekdayGroup.upsert.mock.calls
      .map(([arg]) => (arg as { create: { selectedWeekday: number; groupId: number } }).create)
      .map(c => [c.selectedWeekday, c.groupId])
      .sort()
    expect(days).toEqual([
      [1, 1],
      [3, 1],
    ])
  })
})
