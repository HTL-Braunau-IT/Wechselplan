import type { Session } from 'next-auth'
import type { Teacher } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { normalizeUsername } from '@/lib/username'

/**
 * Resolve the Teacher record for the signed-in user.
 *
 * The historical lookup keyed only on `normalizeUsername(session.user.name)`.
 * After the Entra migration `session.user.name` is the display name ("Anna
 * Müller"), which normalises to "anna müller" and does not match a `username`
 * stored from the UPN ("anna.mueller"), so teachers with a class assignment
 * were silently treated as having none.
 *
 * Keys are tried in order of authority: the Entra object id first (it *is* the
 * signed-in identity, so it can never resolve to the wrong row), then the
 * display-name username, then the UPN/email local part, then the full email.
 * Every key (`username`, `externalId`, `email`) is unique on Teacher, so each
 * step matches at most one row.
 */
export async function resolveSessionTeacher(session: Session | null): Promise<Teacher | null> {
  const user = session?.user
  if (!user) return null

  const oid = typeof user.id === 'string' ? user.id.trim() : ''
  const email = typeof user.email === 'string' ? user.email.trim() : ''
  const nameUsername = normalizeUsername(user.name ?? '')
  const emailUsername = normalizeUsername(email)

  // 1) Entra object id — the authoritative identity for a synced account.
  if (oid) {
    const byOid = await prisma.teacher.findFirst({ where: { externalId: oid } })
    if (byOid) return byOid
  }

  // 2) Username: the display name, then the UPN/email local part.
  for (const username of new Set([nameUsername, emailUsername].filter(Boolean))) {
    const byUsername = await prisma.teacher.findUnique({ where: { username } })
    if (byUsername) return byUsername
  }

  // 3) Full email (unique on Teacher).
  if (email) {
    const byEmail = await prisma.teacher.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    })
    if (byEmail) return byEmail
  }

  // Log only whether each path was available — never the raw identity (PII).
  console.warn('[session-teacher] No Teacher matched the session', {
    hadOid: Boolean(oid),
    hadEmail: Boolean(email),
    hadName: Boolean(nameUsername),
  })
  return null
}
