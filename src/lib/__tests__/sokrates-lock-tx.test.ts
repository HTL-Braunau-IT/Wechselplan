import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The transactional half of the Sokrates lock: the shared advisory-lock section
 * every grade write funnels through, and who recordSokratesChanges tells about a
 * change once the write has landed.
 *
 * The pure lock predicates live in sokrates-lock.test.ts; this file needs the
 * database and notification layers, so it mocks them.
 */

const txExecuteRaw = vi.hoisted(() => vi.fn())
const mockTransaction = vi.hoisted(() => vi.fn())
const mockClassFindUnique = vi.hoisted(() => vi.fn())
const mockStudentFindMany = vi.hoisted(() => vi.fn())
const mockTeacherFindMany = vi.hoisted(() => vi.fn())
const mockNoticeCreateMany = vi.hoisted(() => vi.fn())
const mockNoticeCount = vi.hoisted(() => vi.fn())
const mockNotify = vi.hoisted(() => vi.fn())
const mockSendEmail = vi.hoisted(() => vi.fn())

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: mockTransaction,
    class: { findUnique: mockClassFindUnique },
    student: { findMany: mockStudentFindMany },
    teacher: { findMany: mockTeacherFindMany },
    sokratesChangeNotice: { createMany: mockNoticeCreateMany, count: mockNoticeCount },
  },
}))
vi.mock('@/lib/notifications', () => ({
  notify: mockNotify,
  // bestEffort must run its callback so the notify inside it is reached.
  bestEffort: async (_what: string, run: () => Promise<void>) => run(),
  notensammlerLink: (name: string) => `/notensammler?class=${name}`,
  sokratesChangeDedupeKey: (p: { classId: number; schoolYearId: number; semester: string }) =>
    `sokrates-change:${p.classId}:${p.schoolYearId}:${p.semester}`,
}))
vi.mock('@/server/send-support-email-graph', () => ({ sendEmail: mockSendEmail }))
vi.mock('@/lib/sentry', () => ({ captureError: vi.fn() }))

import {
  canManageSokrates,
  recordSokratesChanges,
  withSokratesLock,
  type SokratesStatus,
} from '@/lib/sokrates-lock'

const markedSecond = (transferId = 5): SokratesStatus => ({
  first: {
    marked: false,
    markedAt: null,
    markedByName: null,
    lockedAll: false,
    lockedTeacherIds: [],
    transferId: null,
  },
  second: {
    marked: true,
    markedAt: '2026-02-16T00:00:00.000Z',
    markedByName: 'Bernhard Mayr',
    lockedAll: true,
    lockedTeacherIds: [],
    transferId,
  },
})

describe('withSokratesLock', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Interactive transaction: hand the callback a tx exposing $executeRaw.
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn({ $executeRaw: txExecuteRaw }),
    )
  })

  it('acquires the advisory lock before running the body, and returns its result', async () => {
    let lockHeldWhenBodyRan = false
    const result = await withSokratesLock(7, 2026, async () => {
      lockHeldWhenBodyRan = txExecuteRaw.mock.calls.length > 0
      return 'written'
    })

    expect(result).toBe('written')
    expect(lockHeldWhenBodyRan).toBe(true)
    // The lock key is namespaced by class + school year.
    const [strings, value] = txExecuteRaw.mock.calls[0] as [TemplateStringsArray, unknown]
    expect(strings.join('?')).toContain('pg_advisory_xact_lock')
    expect(value).toBe('sokrates:7:2026')
  })

  it('runs the whole body inside one transaction', async () => {
    await withSokratesLock(1, 1, async () => undefined)
    expect(mockTransaction).toHaveBeenCalledTimes(1)
  })
})

describe('canManageSokrates', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // The class is led by teacher 59.
    mockClassFindUnique.mockResolvedValue({ classLeadId: 59 })
  })

  it('lets the class lead manage, no override needed', async () => {
    expect(await canManageSokrates({ classId: 1, role: 'teacher', teacherId: 59 })).toBe(true)
  })

  it('refuses a teacher who is not the class lead', async () => {
    expect(await canManageSokrates({ classId: 1, role: 'teacher', teacherId: 7 })).toBe(false)
  })

  it('refuses an admin who has NOT asked to override', async () => {
    // The whole point of the change: admin alone is no longer enough.
    expect(await canManageSokrates({ classId: 1, role: 'admin', teacherId: 7 })).toBe(false)
    expect(await canManageSokrates({ classId: 1, role: 'admin', teacherId: null })).toBe(false)
  })

  it('lets an admin through only with an explicit one-time override', async () => {
    expect(
      await canManageSokrates({ classId: 1, role: 'admin', teacherId: 7, adminOverride: true }),
    ).toBe(true)
    expect(
      await canManageSokrates({ classId: 1, role: 'admin', teacherId: null, adminOverride: true }),
    ).toBe(true)
  })

  it('does not let a non-admin escalate by sending the override flag', async () => {
    expect(
      await canManageSokrates({ classId: 1, role: 'teacher', teacherId: 7, adminOverride: true }),
    ).toBe(false)
    expect(
      await canManageSokrates({ classId: 1, role: undefined, teacherId: 7, adminOverride: true }),
    ).toBe(false)
  })

  it('still lets the lead manage even if they are also an admin, without the flag', async () => {
    expect(await canManageSokrates({ classId: 1, role: 'admin', teacherId: 59 })).toBe(true)
  })
})

describe('recordSokratesChanges', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockStudentFindMany.mockResolvedValue([{ id: 1, firstName: 'Lukas', lastName: 'Bauer' }])
    mockTeacherFindMany.mockResolvedValue([{ id: 2, firstName: 'Bernhard', lastName: 'Mayr' }])
    mockNoticeCreateMany.mockResolvedValue({ count: 1 })
    mockNoticeCount.mockResolvedValue(1)
    mockNotify.mockResolvedValue(1)
  })

  const change = { studentId: 1, teacherId: 2, semester: 'second' as const, oldGrade: 2, newGrade: 5 }

  it('notifies the class lead who changed their own class — including the actor', async () => {
    // The lead (id 2) is the changer. Previously this was skipped entirely; the
    // lead specifically asked to be reminded of their own post-mark edits.
    mockClassFindUnique.mockResolvedValue({
      name: '1AHIF',
      classLead: { id: 2, firstName: 'Bernhard', lastName: 'Mayr', email: 'lead@example.invalid' },
    })

    await recordSokratesChanges({
      classId: 1,
      schoolYearId: 1,
      changedById: 2,
      changedByName: 'Bernhard Mayr',
      status: markedSecond(),
      changes: [change],
    })

    expect(mockNoticeCreateMany).toHaveBeenCalled()
    expect(mockNotify).toHaveBeenCalledTimes(1)
    const arg = mockNotify.mock.calls[0]![0] as {
      recipientIds: number[]
      includeActor?: boolean
      actorId: number
    }
    expect(arg.recipientIds).toContain(2)
    expect(arg.includeActor).toBe(true)
    // A lead editing their own class already gets the bell; don't also email them.
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it('notifies both the class lead and a different changer, and emails the lead', async () => {
    mockClassFindUnique.mockResolvedValue({
      name: '1AHIF',
      classLead: { id: 2, firstName: 'Bernhard', lastName: 'Mayr', email: 'lead@example.invalid' },
    })

    await recordSokratesChanges({
      classId: 1,
      schoolYearId: 1,
      changedById: 1, // a subject teacher, not the lead
      changedByName: 'Anna Huber',
      status: markedSecond(),
      changes: [change],
    })

    const arg = mockNotify.mock.calls[0]![0] as { recipientIds: number[]; includeActor?: boolean }
    expect(arg.recipientIds).toEqual(expect.arrayContaining([1, 2]))
    expect(arg.includeActor).toBe(true)
    // The lead is a different person here, so the redundant email still goes out.
    expect(mockSendEmail).toHaveBeenCalledTimes(1)
  })

  it('ignores no-op changes (value unchanged)', async () => {
    mockClassFindUnique.mockResolvedValue({
      name: '1AHIF',
      classLead: { id: 2, firstName: 'B', lastName: 'M', email: null },
    })

    const created = await recordSokratesChanges({
      classId: 1,
      schoolYearId: 1,
      changedById: 1,
      changedByName: 'Anna Huber',
      status: markedSecond(),
      changes: [{ ...change, oldGrade: 5, newGrade: 5 }],
    })

    expect(created).toBe(0)
    expect(mockNotify).not.toHaveBeenCalled()
  })
})
