import type { Session } from 'next-auth'
import type { Student } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { normalizeUsername } from '@/lib/username'

/**
 * Resolve the Student record for the signed-in user.
 *
 * The student counterpart of {@link import('./session-teacher').resolveSessionTeacher}:
 * after the Entra migration `session.user.name` is a display name, so keying a
 * lookup on `username` alone silently matches nobody. Keys are tried in order
 * of authority: the Entra object id first (it *is* the signed-in identity),
 * then the display-name username, then the UPN/email local part, then the full
 * email.
 *
 * `username` and `externalId` are unique on Student; `email` is not, so the
 * email fallback is only accepted when it identifies exactly one student.
 */
export async function resolveSessionStudent(session: Session | null): Promise<Student | null> {
  const user = session?.user
  if (!user) return null

  const oid = typeof user.id === 'string' ? user.id.trim() : ''
  const email = typeof user.email === 'string' ? user.email.trim() : ''
  const nameUsername = normalizeUsername(user.name ?? '')
  const emailUsername = normalizeUsername(email)

  // 1) Entra object id — the authoritative identity for a synced account.
  if (oid) {
    const byOid = await prisma.student.findFirst({ where: { externalId: oid } })
    if (byOid) return byOid
  }

  // 2) Username: the display name, then the UPN/email local part.
  for (const username of new Set([nameUsername, emailUsername].filter(Boolean))) {
    const byUsername = await prisma.student.findUnique({ where: { username } })
    if (byUsername) return byUsername
  }

  // 3) Full email — accept only when it identifies exactly one student, since
  //    Student.email is not unique.
  if (email) {
    const matches = await prisma.student.findMany({
      where: { email: { equals: email, mode: 'insensitive' } },
      take: 2,
    })
    if (matches.length === 1) return matches[0]!
  }

  // Log only whether each path was available — never the raw identity (PII).
  console.warn('[session-student] No Student matched the session', {
    hadOid: Boolean(oid),
    hadEmail: Boolean(email),
    hadName: Boolean(nameUsername),
  })
  return null
}
