import { NextResponse } from 'next/server'
import { getServerSession, type Session } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { requireAdmin } from '@/lib/require-admin'
import { isStaffRole, type AccessTier } from '@/lib/api-access'

/**
 * Route-handler wrappers that enforce the access policy inside the handler.
 *
 * `middleware.ts` already rejects unauthorised API requests, but middleware is
 * easy to bypass in tests and easy to mis-scope with a matcher change, so
 * handlers that touch or return sensitive data wrap themselves as well.
 */

export type RouteContext = Record<string, unknown>

export type GuardedHandler<C extends RouteContext = RouteContext> = (
  request: Request,
  context: C & { session: Session },
) => Promise<Response> | Response

function unauthorized(): Response {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

function forbidden(required: string): Response {
  return NextResponse.json({ error: `Forbidden: ${required} role required` }, { status: 403 })
}

/**
 * Assertion-style guard for handlers that cannot easily change their
 * signature (route handlers taking `params`, or handlers with several early
 * returns). Returns a `Response` to send back, or `null` when access is
 * granted:
 *
 * ```ts
 * export async function GET(request: Request) {
 *   const denied = await denyUnlessAccess('staff')
 *   if (denied) return denied
 *   …
 * }
 * ```
 */
export async function denyUnlessAccess(tier: AccessTier): Promise<Response | null> {
  if (tier === 'public') return null

  const session = await getServerSession(authOptions)
  if (!session?.user) return unauthorized()

  if (tier === 'session') return null
  if (tier === 'staff') return isStaffRole(session.user.role) ? null : forbidden('teacher')

  const auth = await requireAdmin()
  return auth.ok ? null : forbidden('admin')
}

/** Requires any signed-in user. */
export function withSession<C extends RouteContext>(handler: GuardedHandler<C>) {
  return async (request: Request, context: C): Promise<Response> => {
    const session = await getServerSession(authOptions)
    if (!session?.user) return unauthorized()
    return handler(request, { ...context, session })
  }
}

/** Requires a signed-in teacher or admin. */
export function withStaff<C extends RouteContext>(handler: GuardedHandler<C>) {
  return async (request: Request, context: C): Promise<Response> => {
    const session = await getServerSession(authOptions)
    if (!session?.user) return unauthorized()
    if (!isStaffRole(session.user.role)) return forbidden('teacher')
    return handler(request, { ...context, session })
  }
}

/**
 * Requires the local additive admin role.
 *
 * Delegates to {@link requireAdmin}, which also honours the super-admin object
 * id and tolerates Entra sessions whose `name` was derived from the display
 * name rather than the UPN.
 */
export function withAdmin<C extends RouteContext>(handler: GuardedHandler<C>) {
  return async (request: Request, context: C): Promise<Response> => {
    const session = await getServerSession(authOptions)
    if (!session?.user) return unauthorized()
    const auth = await requireAdmin()
    if (!auth.ok) return forbidden('admin')
    return handler(request, { ...context, session: auth.session })
  }
}
