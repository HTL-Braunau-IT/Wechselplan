import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Session } from 'next-auth'
import { resolveSessionStudent } from '../session-student'
import { prisma } from '@/lib/prisma'
import { makeStudent } from '@/test/fixtures'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    student: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
  },
}))

const findUnique = vi.mocked(prisma.student.findUnique)
const findFirst = vi.mocked(prisma.student.findFirst)
const findMany = vi.mocked(prisma.student.findMany)

function session(user: Partial<NonNullable<Session['user']>>): Session {
  return { user, expires: '2999-01-01' } as Session
}

describe('resolveSessionStudent', () => {
  beforeEach(() => {
    findUnique.mockReset().mockResolvedValue(null)
    findFirst.mockReset().mockResolvedValue(null)
    findMany.mockReset().mockResolvedValue([])
  })

  it('resolves by the Entra object id first and skips the username lookups', async () => {
    const student = makeStudent({ id: 3, externalId: 'oid-7' })
    findFirst.mockResolvedValueOnce(student)

    const result = await resolveSessionStudent(
      session({ id: 'oid-7', name: 'max.muster', email: 'max.muster@school.at' }),
    )

    expect(result).toBe(student)
    expect(findFirst).toHaveBeenCalledWith({ where: { externalId: 'oid-7' } })
    expect(findUnique).not.toHaveBeenCalled()
  })

  it('prefers the object-id row over a colliding display-name username', async () => {
    const byOid = makeStudent({ id: 4, externalId: 'oid-8' })
    findFirst.mockResolvedValueOnce(byOid)
    findUnique.mockResolvedValue(makeStudent({ id: 88, username: 'max muster' }))

    const result = await resolveSessionStudent(
      session({ id: 'oid-8', name: 'Max Muster', email: 'x@school.at' }),
    )

    expect(result).toBe(byOid)
    expect(findUnique).not.toHaveBeenCalled()
  })

  it('falls back to the display-name username when the object id does not match', async () => {
    const student = makeStudent({ id: 5, username: 'max.muster' })
    findUnique.mockResolvedValueOnce(student)

    const result = await resolveSessionStudent(
      session({ id: 'oid-x', name: 'max.muster', email: 'max.muster@school.at' }),
    )

    expect(result).toBe(student)
    expect(findUnique).toHaveBeenNthCalledWith(1, { where: { username: 'max.muster' } })
  })

  it('accepts the full-email fallback only when exactly one student matches', async () => {
    const student = makeStudent({ id: 6, email: 'max.muster@school.at' })
    findMany.mockResolvedValueOnce([student])

    const result = await resolveSessionStudent(
      session({ id: '', name: '', email: 'Max.Muster@school.at' }),
    )

    expect(result).toBe(student)
    expect(findMany).toHaveBeenLastCalledWith({
      where: { email: { equals: 'Max.Muster@school.at', mode: 'insensitive' } },
      take: 2,
    })
  })

  it('rejects the email fallback when the address is shared by several students', async () => {
    findMany.mockResolvedValueOnce([makeStudent({ id: 7 }), makeStudent({ id: 8 })])

    const result = await resolveSessionStudent(
      session({ id: '', name: '', email: 'shared@school.at' }),
    )

    expect(result).toBeNull()
  })

  it('returns null when nothing matches', async () => {
    const result = await resolveSessionStudent(
      session({ id: 'oid', name: 'Nobody', email: 'nobody@school.at' }),
    )
    expect(result).toBeNull()
  })
})
