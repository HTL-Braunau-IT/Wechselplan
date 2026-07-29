import type { Session } from 'next-auth'
import type { Student } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { normalizeUsername } from '@/lib/username'

/**
 * Resolve the Student record for the signed-in user.
 *
 * The student counterpart of {@link import('./session-teacher').resolveSessionTeacher}:
 * after the Entra migration `session.user.name` is a display name, so keying a
 * lookup on `username` alone silently matches nobody. Keys are tried
 * current-behaviour-first (name → username), then the authoritative Entra
 * object id, then the UPN/email local part, then the full email.
 *
 * `username` and `externalId` are unique on Student; `email` is not, so the
 * email fallback takes the first match.
 */
export async function resolveSessionStudent(session: Session | null): Promise<Student | null> {
  const user = session?.user
  if (!user) return null

  const nameUsername = normalizeUsername(user.name ?? '')
  if (nameUsername) {
    const byName = await prisma.student.findUnique({ where: { username: nameUsername } })
    if (byName) return byName
  }

  const oid = typeof user.id === 'string' ? user.id.trim() : ''
  if (oid) {
    const byOid = await prisma.student.findFirst({ where: { externalId: oid } })
    if (byOid) return byOid
  }

  const email = typeof user.email === 'string' ? user.email.trim() : ''

  const emailUsername = normalizeUsername(email)
  if (emailUsername && emailUsername !== nameUsername) {
    const byEmailUsername = await prisma.student.findUnique({
      where: { username: emailUsername },
    })
    if (byEmailUsername) return byEmailUsername
  }

  if (email) {
    const byEmail = await prisma.student.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    })
    if (byEmail) return byEmail
  }

  console.warn('[session-student] No Student matched the session', {
    name: user.name,
    email,
    oid,
    nameUsername,
  })
  return null
}
