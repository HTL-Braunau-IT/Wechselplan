import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const checkMemberGroups = vi.fn<(userId: string, groupIds: readonly string[]) => Promise<string[]>>()
const getSyncedClassGroupIdsCached = vi.fn<() => Promise<string[]>>()

vi.mock('@/lib/graph', () => ({ checkMemberGroups }))
vi.mock('@/lib/directory-sync-settings', () => ({ getSyncedClassGroupIdsCached }))
vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('@/lib/ldap', () => ({ LDAPClient: class {} }))

const TEACHER_GROUP = 'teacher-group-oid'
const CLASS_GROUP = 'class-1-oid'

async function loadAuth() {
  const mod = await import('@/lib/auth')
  mod.invalidateMicrosoftAccess()
  return mod
}

describe('resolveMicrosoftAccess', () => {
  beforeEach(() => {
    vi.resetModules()
    checkMemberGroups.mockReset()
    getSyncedClassGroupIdsCached.mockReset()
    getSyncedClassGroupIdsCached.mockResolvedValue([CLASS_GROUP])
    process.env.ENTRA_TEACHER_GROUP_ID = TEACHER_GROUP
    delete process.env.MS_STUDENT_GROUPS
    delete process.env.MS_TEACHER_GROUPS
  })

  afterEach(() => {
    delete process.env.ENTRA_TEACHER_GROUP_ID
  })

  it('grants the teacher role for members of the teacher group', async () => {
    checkMemberGroups.mockResolvedValue([TEACHER_GROUP])
    const { resolveMicrosoftAccess } = await loadAuth()

    await expect(resolveMicrosoftAccess('user-oid')).resolves.toEqual({
      allowed: true,
      role: 'teacher',
    })
  })

  it('grants the student role for members of a synced class group', async () => {
    checkMemberGroups.mockResolvedValue([CLASS_GROUP])
    const { resolveMicrosoftAccess } = await loadAuth()

    await expect(resolveMicrosoftAccess('user-oid')).resolves.toEqual({
      allowed: true,
      role: 'student',
    })
  })

  it('prefers teacher when the user is in both a class group and the teacher group', async () => {
    checkMemberGroups.mockResolvedValue([CLASS_GROUP, TEACHER_GROUP])
    const { resolveMicrosoftAccess } = await loadAuth()

    await expect(resolveMicrosoftAccess('user-oid')).resolves.toEqual({
      allowed: true,
      role: 'teacher',
    })
  })

  it('denies users who are in none of the configured groups', async () => {
    checkMemberGroups.mockResolvedValue([])
    const { resolveMicrosoftAccess } = await loadAuth()

    await expect(resolveMicrosoftAccess('user-oid')).resolves.toEqual({
      allowed: false,
      role: 'user',
    })
  })

  it('reads the class group list from the database, not the environment', async () => {
    process.env.ENTRA_SYNC_CLASS_GROUP_IDS = 'stale-env-group'
    getSyncedClassGroupIdsCached.mockResolvedValue(['db-group'])
    checkMemberGroups.mockResolvedValue(['db-group'])

    const { resolveMicrosoftAccess } = await loadAuth()
    await expect(resolveMicrosoftAccess('user-oid')).resolves.toEqual({
      allowed: true,
      role: 'student',
    })

    const [, queriedGroups] = checkMemberGroups.mock.calls[0]!
    expect(queriedGroups).toContain('db-group')
    expect(queriedGroups).not.toContain('stale-env-group')

    delete process.env.ENTRA_SYNC_CLASS_GROUP_IDS
  })

  it('denies rather than falling open when nothing is configured', async () => {
    delete process.env.ENTRA_TEACHER_GROUP_ID
    getSyncedClassGroupIdsCached.mockResolvedValue([])

    const { resolveMicrosoftAccess } = await loadAuth()
    await expect(resolveMicrosoftAccess('user-oid')).resolves.toEqual({
      allowed: false,
      role: 'user',
    })
    expect(checkMemberGroups).not.toHaveBeenCalled()
  })

  it('denies an empty object id without calling Graph', async () => {
    const { resolveMicrosoftAccess } = await loadAuth()

    await expect(resolveMicrosoftAccess('   ')).resolves.toEqual({
      allowed: false,
      role: 'user',
    })
    expect(checkMemberGroups).not.toHaveBeenCalled()
  })

  it('memoises per user so the signIn and jwt callbacks share one Graph lookup', async () => {
    checkMemberGroups.mockResolvedValue([TEACHER_GROUP])
    const { resolveMicrosoftAccess } = await loadAuth()

    await resolveMicrosoftAccess('user-oid')
    await resolveMicrosoftAccess('user-oid')

    expect(checkMemberGroups).toHaveBeenCalledTimes(1)
  })

  it('does not share cache entries between users', async () => {
    checkMemberGroups.mockResolvedValueOnce([TEACHER_GROUP]).mockResolvedValueOnce([CLASS_GROUP])
    const { resolveMicrosoftAccess } = await loadAuth()

    await expect(resolveMicrosoftAccess('teacher-oid')).resolves.toMatchObject({ role: 'teacher' })
    await expect(resolveMicrosoftAccess('student-oid')).resolves.toMatchObject({ role: 'student' })
    expect(checkMemberGroups).toHaveBeenCalledTimes(2)
  })

  it('still honours the legacy MS_* group variables during rollout', async () => {
    process.env.MS_TEACHER_GROUPS = 'legacy-teacher'
    checkMemberGroups.mockResolvedValue(['legacy-teacher'])

    const { resolveMicrosoftAccess } = await loadAuth()
    await expect(resolveMicrosoftAccess('user-oid')).resolves.toEqual({
      allowed: true,
      role: 'teacher',
    })
  })
})
