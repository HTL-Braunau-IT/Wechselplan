import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Session } from 'next-auth'
import { resolveSessionStudent } from '../session-student'
import { prisma } from '@/lib/prisma'
import { makeStudent } from '@/test/fixtures'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    student: { findUnique: vi.fn(), findFirst: vi.fn() },
  },
}))

const findUnique = vi.mocked(prisma.student.findUnique)
const findFirst = vi.mocked(prisma.student.findFirst)

function session(user: Partial<NonNullable<Session['user']>>): Session {
  return { user, expires: '2999-01-01' } as Session
}

describe('resolveSessionStudent', () => {
  beforeEach(() => {
    findUnique.mockReset().mockResolvedValue(null)
    findFirst.mockReset().mockResolvedValue(null)
  })

  it('resolves by the name username first and skips the fallbacks', async () => {
    const student = makeStudent({ id: 3, username: 'max.muster' })
    findUnique.mockResolvedValueOnce(student)

    const result = await resolveSessionStudent(
      session({ id: 'oid', name: 'max.muster', email: 'max.muster@school.at' }),
    )

    expect(result).toBe(student)
    expect(findUnique).toHaveBeenCalledWith({ where: { username: 'max.muster' } })
    expect(findFirst).not.toHaveBeenCalled()
  })

  it('falls back to the Entra object id', async () => {
    const student = makeStudent({ id: 4, externalId: 'oid-7' })
    findFirst.mockResolvedValueOnce(student)

    const result = await resolveSessionStudent(
      session({ id: 'oid-7', name: 'Max Muster', email: 'max.muster@school.at' }),
    )

    expect(result).toBe(student)
    expect(findFirst).toHaveBeenCalledWith({ where: { externalId: 'oid-7' } })
  })

  it('falls back to the UPN/email local part as a username', async () => {
    const student = makeStudent({ id: 5, username: 'max.muster' })
    findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(student)

    const result = await resolveSessionStudent(
      session({ id: 'oid-x', name: 'Max Muster', email: 'max.muster@school.at' }),
    )

    expect(result).toBe(student)
    expect(findUnique).toHaveBeenNthCalledWith(2, { where: { username: 'max.muster' } })
  })

  it('falls back to a case-insensitive full email match', async () => {
    const student = makeStudent({ id: 6, email: 'max.muster@school.at' })
    findFirst.mockResolvedValueOnce(student)

    const result = await resolveSessionStudent(
      session({ id: '', name: '', email: 'Max.Muster@school.at' }),
    )

    expect(result).toBe(student)
    expect(findFirst).toHaveBeenLastCalledWith({
      where: { email: { equals: 'Max.Muster@school.at', mode: 'insensitive' } },
    })
  })

  it('returns null when nothing matches', async () => {
    const result = await resolveSessionStudent(
      session({ id: 'oid', name: 'Nobody', email: 'nobody@school.at' }),
    )
    expect(result).toBeNull()
  })
})
