import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Session } from 'next-auth'
import { resolveSessionTeacher } from '../session-teacher'
import { prisma } from '@/lib/prisma'
import { makeTeacher } from '@/test/fixtures'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    teacher: { findUnique: vi.fn(), findFirst: vi.fn() },
  },
}))

const findUnique = vi.mocked(prisma.teacher.findUnique)
const findFirst = vi.mocked(prisma.teacher.findFirst)

function session(user: Partial<NonNullable<Session['user']>>): Session {
  return { user, expires: '2999-01-01' } as Session
}

describe('resolveSessionTeacher', () => {
  beforeEach(() => {
    findUnique.mockReset().mockResolvedValue(null)
    findFirst.mockReset().mockResolvedValue(null)
  })

  it('resolves by the Entra object id first and skips the username lookups', async () => {
    const teacher = makeTeacher({ id: 7, externalId: 'oid-1' })
    findFirst.mockResolvedValueOnce(teacher) // externalId lookup

    const result = await resolveSessionTeacher(
      session({ id: 'oid-1', name: 'anna.mueller', email: 'anna.mueller@school.at' }),
    )

    expect(result).toBe(teacher)
    expect(findFirst).toHaveBeenCalledWith({ where: { externalId: 'oid-1' } })
    // The authoritative key hit, so no username lookup should happen.
    expect(findUnique).not.toHaveBeenCalled()
  })

  it('prefers the object-id row over a colliding display-name username', async () => {
    const byOid = makeTeacher({ id: 2, externalId: 'oid-2' })
    findFirst.mockResolvedValueOnce(byOid)
    // A different teacher happens to carry the normalized display name as username.
    findUnique.mockResolvedValue(makeTeacher({ id: 99, username: 'anna müller' }))

    const result = await resolveSessionTeacher(
      session({ id: 'oid-2', name: 'Anna Müller', email: 'a@school.at' }),
    )

    expect(result).toBe(byOid)
    expect(findUnique).not.toHaveBeenCalled()
  })

  it('falls back to the display-name username when the object id does not match', async () => {
    const teacher = makeTeacher({ id: 9, username: 'anna.mueller' })
    findUnique.mockResolvedValueOnce(teacher)

    const result = await resolveSessionTeacher(
      session({ id: 'oid-x', name: 'anna.mueller', email: 'anna.mueller@school.at' }),
    )

    expect(result).toBe(teacher)
    expect(findFirst).toHaveBeenCalledWith({ where: { externalId: 'oid-x' } })
    expect(findUnique).toHaveBeenNthCalledWith(1, { where: { username: 'anna.mueller' } })
  })

  it('falls back to the UPN/email local part as a username', async () => {
    const teacher = makeTeacher({ id: 11, username: 'anna.mueller' })
    // display name "Anna Müller" -> "anna müller" misses; email local part hits.
    findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(teacher)

    const result = await resolveSessionTeacher(
      session({ id: '', name: 'Anna Müller', email: 'anna.mueller@school.at' }),
    )

    expect(result).toBe(teacher)
    expect(findUnique).toHaveBeenNthCalledWith(1, { where: { username: 'anna müller' } })
    expect(findUnique).toHaveBeenNthCalledWith(2, { where: { username: 'anna.mueller' } })
  })

  it('falls back to a case-insensitive full email match', async () => {
    const teacher = makeTeacher({ id: 13, email: 'anna.mueller@school.at' })
    findFirst.mockResolvedValueOnce(teacher)

    const result = await resolveSessionTeacher(
      session({ id: '', name: '', email: 'Anna.Mueller@school.at' }),
    )

    expect(result).toBe(teacher)
    expect(findFirst).toHaveBeenLastCalledWith({
      where: { email: { equals: 'Anna.Mueller@school.at', mode: 'insensitive' } },
    })
  })

  it('returns null when nothing matches', async () => {
    const result = await resolveSessionTeacher(
      session({ id: 'oid', name: 'Nobody', email: 'nobody@school.at' }),
    )
    expect(result).toBeNull()
  })

  it('returns null without querying when there is no user', async () => {
    expect(await resolveSessionTeacher(null)).toBeNull()
    expect(findUnique).not.toHaveBeenCalled()
    expect(findFirst).not.toHaveBeenCalled()
  })
})
