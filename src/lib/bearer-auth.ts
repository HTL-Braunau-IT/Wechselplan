/**
 * Entra (Azure AD) Bearer access-token verification for the native app.
 *
 * The web app authenticates through NextAuth and carries the session in a
 * cookie. The native app (see the `Wechselplan-App` repo) cannot use that cookie
 * flow, so it runs the OAuth Authorization Code + PKCE flow itself and calls the
 * API with `Authorization: Bearer <access token>`. This module verifies that
 * token's signature and standard claims.
 *
 * It is written to run in **both** the Edge runtime (`middleware.ts`) and the
 * Node runtime (route handlers): it depends only on `jose` (isomorphic) and
 * `fetch`, never on Prisma or the Graph client. Turning a verified token into a
 * role/teacher happens separately, in Node — see `request-session.ts` — because
 * that needs the database and Graph, neither of which the Edge runtime can call.
 *
 * Enabled only when `AUTH_BEARER_ENABLED=true`; otherwise every function here is
 * inert and the API stays cookie-only, exactly as before.
 */

import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose'

/** Claims we rely on from a verified Entra access token. `oid` is always present. */
export interface BearerClaims extends JWTPayload {
  /** Entra object id — the stable identity, matched against Teacher.externalId. */
  oid?: string
  name?: string
  email?: string
  preferred_username?: string
  given_name?: string
  family_name?: string
}

function tenantId(): string {
  return process.env.ENTRA_TENANT_ID?.trim() ?? ''
}

export function isBearerAuthEnabled(): boolean {
  return process.env.AUTH_BEARER_ENABLED?.trim().toLowerCase() === 'true' && Boolean(tenantId())
}

/**
 * Accepted `aud` values. The mobile client requests a scope like
 * `api://<web-client-id>/access_as_user`, so the token's audience is the web
 * app's own registration — either the bare client id or its `api://` URI.
 * `ENTRA_API_AUDIENCE` overrides this when the API is a separate registration.
 */
function acceptedAudiences(): string[] {
  const override = process.env.ENTRA_API_AUDIENCE?.trim()
  if (override) return [override]
  const clientId = process.env.ENTRA_CLIENT_ID?.trim()
  return clientId ? [clientId, `api://${clientId}`] : []
}

/** Entra v2 issuer for the tenant. */
function issuer(): string {
  return `https://login.microsoftonline.com/${tenantId()}/v2.0`
}

// A remote JWKS caches keys and refreshes on rotation, so this is created once
// per runtime instance rather than per request.
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null
function getJwks(): ReturnType<typeof createRemoteJWKSet> {
  jwks ??= createRemoteJWKSet(
    new URL(`https://login.microsoftonline.com/${tenantId()}/discovery/v2.0/keys`),
  )
  return jwks
}

/** Pulls the raw token out of an `Authorization: Bearer <token>` header value. */
export function getBearerToken(authHeader: string | null | undefined): string | null {
  if (!authHeader) return null
  const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim())
  const token = match?.[1]?.trim()
  if (!token) return null
  return token
}

/**
 * Verifies an Entra access token's signature, issuer, audience and expiry.
 * Returns the claims on success, or null on any failure (never throws) so
 * callers can treat an invalid token the same as no token.
 */
export async function verifyBearerToken(token: string): Promise<BearerClaims | null> {
  if (!isBearerAuthEnabled()) return null
  const audiences = acceptedAudiences()
  if (audiences.length === 0) return null

  try {
    const { payload } = await jwtVerify(token, getJwks(), {
      issuer: issuer(),
      audience: audiences,
    })
    const claims = payload as BearerClaims
    // `oid` is the identity everything downstream keys on; refuse a token without
    // one rather than resolving against an ambiguous `sub`.
    if (!claims.oid?.trim()) return null
    return claims
  } catch {
    return null
  }
}
