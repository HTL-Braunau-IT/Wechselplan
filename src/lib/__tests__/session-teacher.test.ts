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

  it('resolves by the display-name username first and skips the fallbacks', async () => {
    const teacher = makeTeacher({ id: 7, username: 'anna.mueller' })
    findUnique.mockResolvedValueOnce(teacher)

    const result = await resolveSessionTeacher(
      session({ id: 'oid-1', name: 'anna.mueller', email: 'anna.mueller@school.at' }),
    )

    expect(result).toBe(teacher)
    expect(findUnique).toHaveBeenCalledWith({ where: { username: 'anna.mueller' } })
    // A first-key hit must not touch externalId/email.
    expect(findFirst).not.toHaveBeenCalled()
  })

  it('falls back to the Entra object id when the name does not match', async () => {
    const teacher = makeTeacher({ id: 9, externalId: 'oid-42' })
    // name lookup misses (default null); the externalId findFirst is the first hit.
    findFirst.mockResolvedValueOnce(teacher)

    const result = await resolveSessionTeacher(
      // display name "Anna Müller" normalises to "anna müller" -> no username match
      session({ id: 'oid-42', name: 'Anna Müller', email: 'anna.mueller@school.at' }),
    )

    expect(result).toBe(teacher)
    expect(findUnique).toHaveBeenCalledWith({ where: { username: 'anna müller' } })
    expect(findFirst).toHaveBeenCalledWith({ where: { externalId: 'oid-42' } })
  })

  it('falls back to the UPN/email local part as a username', async () => {
    const teacher = makeTeacher({ id: 11, username: 'anna.mueller' })
    // 1st findUnique (name "anna müller") misses, 2nd (email local part) hits.
    findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(teacher)

    const result = await resolveSessionTeacher(
      session({ id: 'oid-x', name: 'Anna Müller', email: 'anna.mueller@school.at' }),
    )

    expect(result).toBe(teacher)
    expect(findUnique).toHaveBeenNthCalledWith(1, { where: { username: 'anna müller' } })
    expect(findUnique).toHaveBeenNthCalledWith(2, { where: { username: 'anna.mueller' } })
  })

  it('falls back to a case-insensitive full email match', async () => {
    const teacher = makeTeacher({ id: 13, email: 'anna.mueller@school.at' })
    // No id and no name, so the email findFirst is the only findFirst call.
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
