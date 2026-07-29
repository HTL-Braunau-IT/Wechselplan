/**
 * Mints a NextAuth session cookie locally, without going through Entra.
 *
 * Entra is the only identity provider (`src/lib/auth.ts`), and its sign-in flow
 * is an interactive OAuth redirect that a browser automation cannot complete
 * unattended. It does not need to: the session strategy is `jwt`, so both
 * enforcement layers resolve identity purely from the session cookie —
 * `middleware.ts` via `getToken`, the route handlers via `getServerSession`.
 * Neither calls Microsoft. A token encrypted with the local `NEXTAUTH_SECRET`
 * is therefore a complete, valid session.
 *
 * This only works against a deployment whose secret you already hold, which in
 * practice means a local one. Nothing here is imported by the app; it exists
 * solely so tests and local driving have a signed-in browser.
 */
import { encode } from 'next-auth/jwt'

export type SessionRole = 'admin' | 'teacher' | 'student' | 'user'

export interface MintSessionOptions {
  /**
   * Normalized username. This is the join key the app uses to find "me":
   * the session callback runs it through `normalizeUsername`, and pages like
   * Notensammler and Schedules look the result up via
   * `/api/teachers/by-username`. It must match a `Teacher.username` row or
   * those pages render as though the teacher does not exist.
   */
  username: string
  role: SessionRole
  /** Entra object id. Surfaces as `session.user.id`; any stable string works. */
  objectId?: string
  email?: string
  firstName?: string | null
  lastName?: string | null
  /** Cookie and JWT lifetime. Defaults to NextAuth's own 30 days. */
  maxAgeSeconds?: number
}

const DEFAULT_MAX_AGE_SECONDS = 30 * 24 * 60 * 60

/**
 * NextAuth prefixes the cookie with `__Secure-` when the canonical URL is
 * https, and rejects the unprefixed name in that case. Derive it from the URL
 * rather than hardcoding, so pointing at an https tunnel still works.
 */
export function sessionCookieName(baseUrl: string): string {
  return baseUrl.startsWith('https://')
    ? '__Secure-next-auth.session-token'
    : 'next-auth.session-token'
}

/**
 * Builds the encrypted JWT that NextAuth will accept as a session.
 *
 * Two fields are load-bearing beyond the obvious ones:
 *
 * - `provider: 'azure-ad'` — without it the `jwt` callback treats the token as
 *   a leftover from the retired LDAP provider and strips the role to `user`
 *   (`src/lib/auth.ts`), so every staff page would redirect to `/`.
 * - `accessCheckedAt: Date.now()` — the callback re-resolves the role against
 *   Graph once the check is older than 15 minutes. Stamping it fresh keeps a
 *   run inside that window. Past it, the Graph call throws for want of real
 *   credentials and the callback's catch leaves the role intact — but only if
 *   at least one group id is configured. With none, `resolveMicrosoftAccess`
 *   returns `role: 'user'` without throwing and silently demotes the session,
 *   which is why `.env` sets a dummy `ENTRA_TEACHER_GROUP_ID`.
 */
export async function mintSessionToken(
  options: MintSessionOptions,
  secret: string,
  now: number,
): Promise<string> {
  const { username, role } = options
  const objectId = options.objectId ?? `e2e-${username}`
  const maxAge = options.maxAgeSeconds ?? DEFAULT_MAX_AGE_SECONDS

  return encode({
    secret,
    maxAge,
    token: {
      sub: objectId,
      name: username,
      email: options.email ?? `${username}@example.invalid`,
      picture: null,
      role,
      provider: 'azure-ad',
      accessCheckedAt: now,
      firstName: options.firstName ?? null,
      lastName: options.lastName ?? null,
    },
  })
}

export interface StorageStateCookie {
  name: string
  value: string
  domain: string
  path: string
  expires: number
  httpOnly: boolean
  secure: boolean
  sameSite: 'Lax' | 'Strict' | 'None'
}

/** Playwright `storageState` shape holding just the session cookie. */
export interface StorageState {
  cookies: StorageStateCookie[]
  origins: never[]
}

export async function buildStorageState(
  options: MintSessionOptions,
  config: { baseUrl: string; secret: string; now: number },
): Promise<StorageState> {
  const { baseUrl, secret, now } = config
  const value = await mintSessionToken(options, secret, now)
  const url = new URL(baseUrl)
  const maxAge = options.maxAgeSeconds ?? DEFAULT_MAX_AGE_SECONDS

  return {
    cookies: [
      {
        name: sessionCookieName(baseUrl),
        value,
        domain: url.hostname,
        path: '/',
        expires: Math.floor(now / 1000) + maxAge,
        httpOnly: true,
        secure: url.protocol === 'https:',
        sameSite: 'Lax',
      },
    ],
    origins: [],
  }
}
