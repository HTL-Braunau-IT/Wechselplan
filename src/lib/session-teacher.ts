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
 * The keys are tried most-forgiving-last but current-behaviour-first, so an
 * account that already resolves by name keeps the exact same identity (a
 * collision can never re-point it), while an account that used to fail now
 * falls back to the authoritative Entra object id, then the UPN/email local
 * part, then the full email. Every key (`username`, `externalId`, `email`) is
 * unique on Teacher, so each step matches at most one row.
 */
export async function resolveSessionTeacher(session: Session | null): Promise<Teacher | null> {
  const user = session?.user
  if (!user) return null

  // 1) Existing behaviour: the provided name → username. Kept first so accounts
  //    that already match do not change which Teacher they resolve to.
  const nameUsername = normalizeUsername(user.name ?? '')
  if (nameUsername) {
    const byName = await prisma.teacher.findUnique({ where: { username: nameUsername } })
    if (byName) return byName
  }

  // 2) Entra object id — the authoritative identity for a synced account.
  const oid = typeof user.id === 'string' ? user.id.trim() : ''
  if (oid) {
    const byOid = await prisma.teacher.findFirst({ where: { externalId: oid } })
    if (byOid) return byOid
  }

  const email = typeof user.email === 'string' ? user.email.trim() : ''

  // 3) UPN/email local part → username (Entra stores username from the UPN).
  const emailUsername = normalizeUsername(email)
  if (emailUsername && emailUsername !== nameUsername) {
    const byEmailUsername = await prisma.teacher.findUnique({
      where: { username: emailUsername },
    })
    if (byEmailUsername) return byEmailUsername
  }

  // 4) Full email match.
  if (email) {
    const byEmail = await prisma.teacher.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    })
    if (byEmail) return byEmail
  }

  console.warn('[session-teacher] No Teacher matched the session', {
    name: user.name,
    email,
    oid,
    nameUsername,
  })
  return null
}
