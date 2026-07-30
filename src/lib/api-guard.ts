import { NextResponse } from 'next/server'
import { getServerSession, type Session } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { requireAdmin } from '@/lib/require-admin'
import { isStaffRole, type AccessTier } from '@/lib/api-access'

/**
 * Route-handler guards that enforce the access policy inside the handler.
 *
 * `middleware.ts` already rejects unauthorised API requests, but middleware is
 * easy to bypass in tests and easy to mis-scope with a matcher change, so
 * handlers that touch or return sensitive data guard themselves as well.
 */

function unauthorized(): Response {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

function forbidden(required: string): Response {
  return NextResponse.json({ error: `Forbidden: ${required} role required` }, { status: 403 })
}

/**
 * Result of {@link requireAccess}: either the resolved session (access granted)
 * or the `Response` to return (access denied).
 */
export type AccessResult = { ok: true; session: Session } | { ok: false; response: Response }

/**
 * Enforces an access tier **and hands back the session it had to resolve**, so
 * a handler that needs the signed-in user does not fetch it a second time.
 *
 * ```ts
 * export async function GET() {
 *   const gate = await requireAccess('staff')
 *   if (!gate.ok) return gate.response
 *   const { session } = gate
 *   …
 * }
 * ```
 *
 * The role check here is exactly the one the tier implies, so a handler must
 * not re-check `session.user.role` afterwards — that branch is already dead.
 */
export async function requireAccess(tier: AccessTier): Promise<AccessResult> {
  const session = await getServerSession(authOptions)

  if (tier === 'public') {
    // `public` never rejects; the session is returned if one happens to exist.
    return { ok: true, session: (session ?? { user: undefined }) as unknown as Session }
  }

  if (!session?.user) return { ok: false, response: unauthorized() }
  if (tier === 'session') return { ok: true, session }
  if (tier === 'staff') {
    return isStaffRole(session.user.role)
      ? { ok: true, session }
      : { ok: false, response: forbidden('teacher') }
  }

  const auth = await requireAdmin()
  return auth.ok ? { ok: true, session: auth.session } : { ok: false, response: forbidden('admin') }
}

/**
 * Assertion-style guard for handlers that do not need the session — a
 * guard-only gate. Returns a `Response` to send back, or `null` when access is
 * granted:
 *
 * ```ts
 * export async function GET() {
 *   const denied = await denyUnlessAccess('staff')
 *   if (denied) return denied
 *   …
 * }
 * ```
 *
 * Prefer {@link requireAccess} when the handler goes on to read the user.
 */
export async function denyUnlessAccess(tier: AccessTier): Promise<Response | null> {
  const gate = await requireAccess(tier)
  return gate.ok ? null : gate.response
}
