import { getServerSession, type Session } from 'next-auth'
import { authOptions, hasRole } from '@/lib/auth'
import { normalizeUsername } from '@/lib/username'

/**
 * Returns the current session when the caller has the local `admin` role.
 *
 * Resolution order:
 * 1. Session was already promoted to role=admin by the JWT callback.
 * 2. Caller's Entra oid matches `ENTRA_SUPER_ADMIN_OBJECT_ID`.
 * 3. A UserRole record with role=admin exists for the caller (matched by
 *    session.user.name, session.user.email, or the normalized email). The
 *    tolerant lookup covers Entra logins where session.user.name was derived
 *    from the display name rather than the UPN/email.
 */
export async function requireAdmin(): Promise<{ ok: true; session: Session } | { ok: false }> {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return { ok: false }
  }

  if (session.user.role === 'admin') {
    return { ok: true, session }
  }

  const superAdminObjectId = process.env.ENTRA_SUPER_ADMIN_OBJECT_ID?.trim()
  const sessionObjectId = session.user.id?.trim()
  if (superAdminObjectId && sessionObjectId && superAdminObjectId === sessionObjectId) {
    return { ok: true, session }
  }

  const candidates = [
    session.user.name,
    session.user.email,
    session.user.email ? normalizeUsername(session.user.email) : null,
  ]
    .map(value => value?.trim())
    .filter((value): value is string => Boolean(value))

  const unique = Array.from(new Set(candidates))

  for (const candidate of unique) {
    const isAdmin = await hasRole(candidate, 'admin')
    if (isAdmin) {
      return { ok: true, session }
    }
  }

  return { ok: false }
}
