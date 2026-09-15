import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const resolveMicrosoftAccess = vi.fn()
const hasRole = vi.fn()

// Mock the auth module so the test drives role resolution without Graph or the
// database (and so importing it does not pull in Prisma).
vi.mock('@/lib/auth', () => ({
  resolveMicrosoftAccess: (...a: unknown[]) => resolveMicrosoftAccess(...a),
  hasRole: (...a: unknown[]) => hasRole(...a),
  authOptions: {},
}))

import { resolveBearerSession } from '@/lib/request-session'

const ORIGINAL_ENV = { ...process.env }

beforeEach(() => {
  resolveMicrosoftAccess.mockReset()
  hasRole.mockReset()
  hasRole.mockResolvedValue(false)
  delete process.env.ENTRA_SUPER_ADMIN_OBJECT_ID
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

describe('resolveBearerSession', () => {
  it('returns null when the user is not in a teacher/student group', async () => {
    resolveMicrosoftAccess.mockResolvedValue({ allowed: false, role: 'user' })
    expect(await resolveBearerSession({ oid: 'oid-1' })).toBeNull()
  })

  it('returns null when claims carry no oid', async () => {
    expect(await resolveBearerSession({ name: 'x' })).toBeNull()
    expect(resolveMicrosoftAccess).not.toHaveBeenCalled()
  })

  it('maps a teacher, keying identity on the oid and normalising the name', async () => {
    resolveMicrosoftAccess.mockResolvedValue({ allowed: true, role: 'teacher' })
    const session = await resolveBearerSession({
      oid: 'oid-1',
      name: 'Anna Müller',
      email: 'anna.mueller@htl-braunau.at',
    })
    expect(session?.user?.id).toBe('oid-1')
    expect(session?.user?.role).toBe('teacher')
    expect(session?.user?.email).toBe('anna.mueller@htl-braunau.at')
    expect(session?.user?.name).toBeTruthy()
  })

  it('maps a student', async () => {
    resolveMicrosoftAccess.mockResolvedValue({ allowed: true, role: 'student' })
    const session = await resolveBearerSession({ oid: 'oid-2' })
    expect(session?.user?.role).toBe('student')
  })

  it('promotes the super admin oid to admin', async () => {
    process.env.ENTRA_SUPER_ADMIN_OBJECT_ID = 'oid-super'
    resolveMicrosoftAccess.mockResolvedValue({ allowed: true, role: 'teacher' })
    const session = await resolveBearerSession({ oid: 'oid-super' })
    expect(session?.user?.role).toBe('admin')
  })

  it('promotes a local additive admin to admin', async () => {
    resolveMicrosoftAccess.mockResolvedValue({ allowed: true, role: 'teacher' })
    hasRole.mockImplementation(async (candidate: string) => candidate.includes('mueller'))
    const session = await resolveBearerSession({
      oid: 'oid-3',
      email: 'anna.mueller@htl-braunau.at',
    })
    expect(session?.user?.role).toBe('admin')
  })

  it('fails closed (null) when role resolution throws', async () => {
    resolveMicrosoftAccess.mockRejectedValue(new Error('graph down'))
    expect(await resolveBearerSession({ oid: 'oid-4' })).toBeNull()
  })
})
