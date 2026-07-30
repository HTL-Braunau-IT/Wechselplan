import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getServerSession } from 'next-auth'
import { isFeatureEnabled } from '@/lib/entitlements'
import { resolveCurrentTeacher } from '@/lib/current-teacher'
import { resolveSchoolYearId } from '@/lib/school-year'
import { acknowledgeSokratesChangeNotices, canManageSokrates } from '@/lib/sokrates-lock'
import { clearSokratesChangeNotifications } from '@/lib/notifications'
import { POST } from '../route'

vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/sentry', () => ({ captureError: vi.fn() }))
vi.mock('@/lib/entitlements', () => ({ isFeatureEnabled: vi.fn() }))
vi.mock('@/lib/current-teacher', () => ({
  resolveCurrentTeacher: vi.fn(),
  actorName: vi.fn(() => 'Anna Berger'),
}))
vi.mock('@/lib/school-year', () => ({ resolveSchoolYearId: vi.fn() }))
vi.mock('@/lib/sokrates-lock', () => ({
  acknowledgeSokratesChangeNotices: vi.fn(),
  canManageSokrates: vi.fn(),
}))
vi.mock('@/lib/notifications', () => ({ clearSokratesChangeNotifications: vi.fn() }))

const request = (body: unknown) =>
  new Request('http://localhost/api/notensammler/sokrates/changes/acknowledge', {
    method: 'POST',
    body: JSON.stringify(body),
  })

describe('POST /api/notensammler/sokrates/changes/acknowledge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getServerSession).mockResolvedValue({ user: { role: 'teacher' } } as never)
    vi.mocked(isFeatureEnabled).mockResolvedValue(true)
    vi.mocked(resolveCurrentTeacher).mockResolvedValue({ id: 7, name: 'Anna Berger' } as never)
    vi.mocked(resolveSchoolYearId).mockResolvedValue(2)
    vi.mocked(canManageSokrates).mockResolvedValue(true)
    vi.mocked(acknowledgeSokratesChangeNotices).mockResolvedValue(3)
    vi.mocked(clearSokratesChangeNotifications).mockResolvedValue(undefined)
  })

  it('rejects a caller who is not the class lead', async () => {
    vi.mocked(canManageSokrates).mockResolvedValue(false)

    const res = await POST(request({ classId: 3 }))

    expect(res.status).toBe(403)
    expect(acknowledgeSokratesChangeNotices).not.toHaveBeenCalled()
  })

  it('requires a classId', async () => {
    const res = await POST(request({}))
    expect(res.status).toBe(400)
  })

  it('acknowledges both semesters and clears the bell entries', async () => {
    const res = await POST(request({ classId: 3 }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ success: true, count: 3 })
    expect(acknowledgeSokratesChangeNotices).toHaveBeenCalledWith(
      expect.objectContaining({
        scopes: [
          { classId: 3, schoolYearId: 2, semester: 'first' },
          { classId: 3, schoolYearId: 2, semester: 'second' },
        ],
        recipientId: 7,
      }),
    )
    expect(clearSokratesChangeNotifications).toHaveBeenCalledTimes(2)
  })

  it('scopes to one semester when asked', async () => {
    await POST(request({ classId: 3, semester: 'first' }))

    expect(acknowledgeSokratesChangeNotices).toHaveBeenCalledWith(
      expect.objectContaining({
        scopes: [{ classId: 3, schoolYearId: 2, semester: 'first' }],
      }),
    )
    expect(clearSokratesChangeNotifications).toHaveBeenCalledTimes(1)
  })
})
