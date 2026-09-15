import { getServerSession, type Session } from 'next-auth'
import { headers } from 'next/headers'
import { authOptions, hasRole, resolveMicrosoftAccess } from '@/lib/auth'
import { getBearerToken, isBearerAuthEnabled, verifyBearerToken, type BearerClaims } from '@/lib/bearer-auth'
import { captureError } from '@/lib/sentry'
import { normalizeUsername } from '@/lib/username'

/**
 * The signed-in identity for the current request, from **either** auth path:
 * the NextAuth session cookie (web) or a verified Entra Bearer token (native
 * app). This is the single place the guards resolve "who is calling", so every
 * handler that goes through `api-guard`/`require-admin` accepts both without any
 * per-handler change.
 *
 * The Bearer path lives here, in the Node runtime, rather than in `bearer-auth`
 * because turning a token into a role needs Graph + the database, which the Edge
 * runtime (middleware) cannot reach. Middleware only verifies the token's
 * authenticity; role enforcement for Bearer requests happens here, inside the
 * handler guard.
 */

/**
 * Builds a cookie-session-equivalent `Session` from verified token claims.
 *
 * Mirrors the `jwt`/`session` callbacks in `auth.ts`: the role comes from Entra
 * group membership (`resolveMicrosoftAccess`), is promoted to `admin` for the
 * super admin oid or a local additive admin assignment, and `user.name` is
 * normalised for the teacher/student lookups. Returns null when the user has no
 * access (not in a teacher/student group) or when role resolution fails — the
 * safe, fail-closed direction, matching `signIn`.
 */
export async function resolveBearerSession(claims: BearerClaims): Promise<Session | null> {
  const oid = claims.oid?.trim()
  if (!oid) return null

  try {
    const access = await resolveMicrosoftAccess(oid)
    if (!access.allowed) return null

    const email = claims.email?.trim() ?? claims.preferred_username?.trim() ?? null
    const displayName = claims.name?.trim() ?? ''

    // Same normalisation the session callback applies, so resolveSessionTeacher's
    // username fallbacks line up with the cookie path (the oid path matches first
    // regardless). First non-empty of display name, email, oid.
    const nameSource = [displayName, email, oid].find(value => Boolean(value)) ?? oid
    const name = normalizeUsername(nameSource)

    // resolveMicrosoftAccess only ever grants 'teacher' or 'student' ('user'
    // means not allowed, already returned above).
    let role: 'admin' | 'teacher' | 'student' = access.role === 'student' ? 'student' : 'teacher'

    // Admin promotion — identical to require-admin's resolution order.
    const superAdmin = process.env.ENTRA_SUPER_ADMIN_OBJECT_ID?.trim()
    if (superAdmin && superAdmin === oid) {
      role = 'admin'
    } else {
      const candidates = Array.from(
        new Set(
          [name, email, email ? normalizeUsername(email) : null]
            .map(value => value?.trim())
            .filter((value): value is string => Boolean(value)),
        ),
      )
      for (const candidate of candidates) {
        if (await hasRole(candidate, 'admin')) {
          role = 'admin'
          break
        }
      }
    }

    const expires =
      typeof claims.exp === 'number'
        ? new Date(claims.exp * 1000).toISOString()
        : new Date(Date.now() + 60 * 60 * 1000).toISOString()

    return {
      user: {
        id: oid,
        name,
        email,
        image: null,
        firstName: claims.given_name?.trim() ?? null,
        lastName: claims.family_name?.trim() ?? null,
        role,
      },
      expires,
    }
  } catch (error) {
    console.error('Error resolving Bearer session:', error)
    captureError(error, { location: 'request-session', type: 'bearer_session_error' })
    return null
  }
}

/**
 * The current request's session from the cookie, or — when none and Bearer auth
 * is enabled — from a verified `Authorization: Bearer` token. Returns null when
 * neither is present/valid.
 */
export async function getEffectiveSession(): Promise<Session | null> {
  const cookieSession = await getServerSession(authOptions)
  if (cookieSession?.user) return cookieSession

  if (!isBearerAuthEnabled()) return null

  const token = getBearerToken((await headers()).get('authorization'))
  if (!token) return null

  const claims = await verifyBearerToken(token)
  if (!claims) return null

  return resolveBearerSession(claims)
}
