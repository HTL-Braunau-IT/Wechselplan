import { beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from '../route'

/**
 * The mark endpoint is the whole Sokrates gate: it decides both *who* may close
 * a class and *what* closing it does. Both are asserted here, because the
 * feature shipped with a mark that locked nobody and an authorisation check that
 * anyone could satisfy by making themselves Klassenleiter.
 */

const mockCanManageSokrates = vi.hoisted(() => vi.fn())
const mockResolveCurrentTeacher = vi.hoisted(() => vi.fn())
const mockUpsert = vi.hoisted(() => vi.fn())
const mockUpdateManyNotices = vi.hoisted(() => vi.fn())

vi.mock('next-auth', () => ({
  getServerSession: vi.fn(async () => ({ user: { name: 'Anna Müller', role: 'teacher' } })),
}))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/sentry', () => ({ captureError: vi.fn() }))
vi.mock('@/lib/entitlements', () => ({ isFeatureEnabled: vi.fn(async () => true) }))
vi.mock('@/lib/school-year', () => ({ resolveSchoolYearId: vi.fn(async () => 2026) }))
vi.mock('@/lib/current-teacher', () => ({
  resolveCurrentTeacher: mockResolveCurrentTeacher,
}))
vi.mock('@/lib/sokrates-lock', () => ({
  canManageSokrates: mockCanManageSokrates,
  resolveCurrentTeacher: mockResolveCurrentTeacher,
  // The route now serialises through withSokratesLock; stand in for it by
  // running the callback against a fake transaction client exposing exactly the
  // models the mark touches. The real advisory-lock acquisition is a lib
  // concern, covered by the sokrates-lock unit tests.
  withSokratesLock: (_classId: number, _schoolYearId: number, fn: (tx: unknown) => unknown) =>
    fn({
      sokratesTransfer: { upsert: mockUpsert },
      sokratesChangeNotice: { updateMany: mockUpdateManyNotices },
    }),
}))
vi.mock('../../_notify', () => ({ notifySokratesMarked: vi.fn(async () => undefined) }))

const post = (body: unknown) =>
  POST(
    new Request('http://localhost/api/notensammler/sokrates/mark', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )

describe('POST /api/notensammler/sokrates/mark', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockResolveCurrentTeacher.mockResolvedValue({ id: 7, name: 'Anna Müller', role: 'teacher' })
    mockCanManageSokrates.mockResolvedValue(true)
    mockUpsert.mockResolvedValue({ id: 55 })
    mockUpdateManyNotices.mockResolvedValue({ count: 0 })
  })

  it('rejects a teacher who is not the class lead', async () => {
    mockCanManageSokrates.mockResolvedValue(false)

    const response = await post({ classId: 3, semester: 'first' })

    expect(response.status).toBe(403)
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('hard-locks the whole semester when marking it', async () => {
    const response = await post({ classId: 3, semester: 'first' })

    expect(response.status).toBe(200)
    const args = mockUpsert.mock.calls[0]![0] as {
      create: { lockedAll: boolean }
      update: { lockedAll: boolean }
    }
    // Marking means "the grades are in Sokrates now" — every teacher is blocked
    // from that moment, without a second click.
    expect(args.create.lockedAll).toBe(true)
    // Re-marking after the lead lifted the lock must re-apply it.
    expect(args.update.lockedAll).toBe(true)
  })

  it('resolves outstanding change notices in the same transaction', async () => {
    await post({ classId: 3, semester: 'first' })

    expect(mockUpdateManyNotices).toHaveBeenCalledWith(
      expect.objectContaining({ where: { transferId: 55, acknowledgedAt: null } }),
    )
  })

  it('rejects a request without a semester', async () => {
    const response = await post({ classId: 3 })

    expect(response.status).toBe(400)
    expect(mockUpsert).not.toHaveBeenCalled()
  })
})
