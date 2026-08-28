import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Covers teacher-sync — the module that decides who exists as a Teacher and thus
 * holds the teacher/admin access tier. `docs/CODE_REVIEW_2026-08.md` (finding 34)
 * flagged it as entirely untested despite carrying the security-sensitive
 * adoption + deactivation logic.
 *
 * Prisma and Graph are faked; the assertions are about which rows the diff
 * classifies and which writes `applyTeacherSync` issues, not about the DB.
 */

const {
  collectGroupMembers,
  recordSyncRun,
  teacherFindMany,
  txTeacherCreate,
  txTeacherUpdate,
} = vi.hoisted(() => ({
  collectGroupMembers: vi.fn(),
  recordSyncRun: vi.fn(),
  teacherFindMany: vi.fn(),
  txTeacherCreate: vi.fn(async () => ({ id: 0 })),
  txTeacherUpdate: vi.fn(async () => ({ id: 0 })),
}))

// Pass-through mapper: the "members" we feed collectGroupMembers ARE EntraUsers,
// so tests can supply canonical rows without constructing raw Graph payloads.
vi.mock('@/lib/graph', () => ({ collectGroupMembers }))
vi.mock('@/lib/entra-user-mapper', () => ({
  mapMemberToEntraUser: (member: unknown) => ({ user: member }),
}))
vi.mock('@/lib/directory-sync-settings', () => ({ recordSyncRun }))
vi.mock('@/lib/sentry', () => ({ captureError: vi.fn() }))

vi.mock('@/lib/prisma', () => ({
  ANY_ACTIVE_STATE: undefined,
  prisma: {
    teacher: { findMany: teacherFindMany },
    $transaction: (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ teacher: { create: txTeacherCreate, update: txTeacherUpdate } }),
  },
}))

import { previewTeacherSync, applyTeacherSync } from '@/lib/teacher-sync'
import { MassDeactivationError } from '@/lib/sync-guard'

type EntraUser = {
  oid: string
  firstName: string
  lastName: string
  email: string | null
  username: string
  displayName: string | null
}

const entra = (over: Partial<EntraUser> & { oid: string; username: string }): EntraUser => ({
  firstName: 'First',
  lastName: 'Last',
  email: null,
  displayName: null,
  ...over,
})

const localTeacher = (over: Record<string, unknown>) => ({
  id: 1,
  firstName: 'First',
  lastName: 'Last',
  email: null,
  username: 'a.b',
  externalId: null,
  externalSource: null,
  isActive: true,
  ...over,
})

describe('teacher-sync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.ENTRA_TEACHER_GROUP_ID = 'teacher-group-oid'
    process.env.SYNC_MAX_DEACTIVATION_RATIO = '0.9'
    collectGroupMembers.mockResolvedValue([])
    teacherFindMany.mockResolvedValue([])
  })

  it('reads TRANSITIVE membership so login and sync agree (finding 10)', async () => {
    await previewTeacherSync()
    expect(collectGroupMembers).toHaveBeenCalledWith('teacher-group-oid', { transitive: true })
  })

  it('adopts an orphan local teacher when username AND email agree', async () => {
    collectGroupMembers.mockResolvedValue([
      entra({ oid: 'oid-1', username: 'a.huber', email: 'a.huber@example.at' }),
    ])
    teacherFindMany.mockResolvedValue([
      localTeacher({ id: 10, username: 'a.huber', email: 'a.huber@example.at', externalId: null }),
    ])

    const diff = await previewTeacherSync()
    expect(diff.toUpdate).toHaveLength(1)
    expect(diff.toUpdate[0]!.willAdopt).toBe(true)
    expect(diff.toUpdate[0]!.existing.id).toBe(10)
    expect(diff.toCreate).toHaveLength(0)
  })

  it('refuses to adopt when username and email point at different rows (conflict → issue, skip)', async () => {
    collectGroupMembers.mockResolvedValue([
      entra({ oid: 'oid-1', username: 'a.huber', email: 'a.huber@example.at' }),
    ])
    teacherFindMany.mockResolvedValue([
      localTeacher({ id: 10, username: 'a.huber', email: null, externalId: null }),
      localTeacher({ id: 11, username: 'x.other', email: 'a.huber@example.at', externalId: null }),
    ])

    const diff = await previewTeacherSync()
    expect(diff.toUpdate).toHaveLength(0)
    expect(diff.toCreate).toHaveLength(0)
    expect(diff.issues.some(i => /Conflicting local teacher candidates/.test(i.reason))).toBe(true)
  })

  it('refuses to bind an ambiguous username match (>1 candidate → issue, skip)', async () => {
    collectGroupMembers.mockResolvedValue([
      entra({ oid: 'oid-1', username: 'a.huber', email: null }),
    ])
    teacherFindMany.mockResolvedValue([
      localTeacher({ id: 10, username: 'a.huber', externalId: null }),
      localTeacher({ id: 11, username: 'a.huber', externalId: null }),
    ])

    const diff = await previewTeacherSync()
    expect(diff.toUpdate).toHaveLength(0)
    expect(diff.toCreate).toHaveLength(0)
    expect(diff.issues.some(i => /Ambiguous local teacher match by username/.test(i.reason))).toBe(
      true,
    )
  })

  it('deactivates only entra-sourced active rows, never LDAP/manual ones', async () => {
    // No Entra members this run → every local row is "missing".
    collectGroupMembers.mockResolvedValue([])
    teacherFindMany.mockResolvedValue([
      localTeacher({ id: 20, username: 'gone.entra', externalId: 'oid-x', externalSource: 'entra' }),
      localTeacher({ id: 21, username: 'manual.user', externalId: null, externalSource: null }),
      localTeacher({ id: 22, username: 'ldap.user', externalId: 'x', externalSource: 'ldap' }),
    ])

    const diff = await previewTeacherSync()
    const ids = diff.toDeactivate.map(d => d.existing.id)
    expect(ids).toEqual([20])
  })

  it('applyTeacherSync writes create/update/deactivate through the transaction', async () => {
    collectGroupMembers.mockResolvedValue([
      entra({ oid: 'new-oid', username: 'new.teacher', email: 'new@example.at' }),
      // Matches the kept row exactly (by oid) → classified "unchanged", which
      // keeps the deactivation ratio below the limit.
      entra({
        oid: 'oid-keep',
        username: 'keep.me',
        firstName: 'Keep',
        lastName: 'Me',
        email: 'keep@example.at',
      }),
    ])
    teacherFindMany.mockResolvedValue([
      localTeacher({
        id: 30,
        username: 'gone.entra',
        externalId: 'oid-gone',
        externalSource: 'entra',
      }),
      localTeacher({
        id: 31,
        username: 'keep.me',
        firstName: 'Keep',
        lastName: 'Me',
        email: 'keep@example.at',
        externalId: 'oid-keep',
        externalSource: 'entra',
      }),
    ])

    await applyTeacherSync()
    expect(txTeacherCreate).toHaveBeenCalledTimes(1)
    // The missing entra-sourced row is deactivated.
    expect(txTeacherUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 30 }, data: expect.objectContaining({ isActive: false }) }),
    )
  })

  it('throws MassDeactivationError when deactivations exceed the ratio', async () => {
    collectGroupMembers.mockResolvedValue([])
    // Two active entra rows, both missing → 2/2 = 100% deactivation.
    teacherFindMany.mockResolvedValue([
      localTeacher({ id: 40, username: 'a.a', externalId: 'o1', externalSource: 'entra' }),
      localTeacher({ id: 41, username: 'b.b', externalId: 'o2', externalSource: 'entra' }),
    ])

    await expect(applyTeacherSync(undefined, { maxDeactivationRatio: 0.2 })).rejects.toBeInstanceOf(
      MassDeactivationError,
    )
    expect(txTeacherUpdate).not.toHaveBeenCalled()
  })
})
