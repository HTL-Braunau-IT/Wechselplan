import { captureError } from '@/lib/sentry'

const GRAPH_BASE_URL = 'https://graph.microsoft.com/v1.0'
const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000
const MAX_RETRIES = 3

interface GraphAppCredentials {
  tenantId: string
  clientId: string
  clientSecret: string
}

interface CachedToken {
  token: string
  expiresAt: number
}

let cachedToken: CachedToken | null = null

/**
 * Directory reads use the `ENTRA_*` app registration and only that one.
 *
 * This used to fall back to `AZURE_AD_*` and then `GRAPH_*`. `AZURE_AD_*` was
 * the pre-migration name for the same registration and is gone; `GRAPH_*` is a
 * *different* registration — it belongs to support-mail sending
 * (`src/server/send-support-email-graph.ts`) and carries `Mail.Send`, not
 * `User.Read.All`. Silently borrowing it meant a tenant missing `ENTRA_*` got a
 * token that authenticated fine and then 403'd deep inside a nightly sync.
 */
function resolveCredentials(): GraphAppCredentials {
  const tenantId = (process.env.ENTRA_TENANT_ID ?? '').trim()
  const clientId = (process.env.ENTRA_CLIENT_ID ?? '').trim()
  const clientSecret = (process.env.ENTRA_CLIENT_SECRET ?? '').trim()

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error(
      'Microsoft Graph credentials are not configured. Set ENTRA_TENANT_ID, ENTRA_CLIENT_ID and ENTRA_CLIENT_SECRET.',
    )
  }

  return { tenantId, clientId, clientSecret }
}

/**
 * Fetches a fresh Graph application access token via the client-credentials flow
 * and caches it in-memory until shortly before it expires.
 */
export async function getGraphAppToken(): Promise<string> {
  const now = Date.now()
  if (cachedToken && now < cachedToken.expiresAt - TOKEN_EXPIRY_BUFFER_MS) {
    return cachedToken.token
  }

  const { tenantId, clientId, clientSecret } = resolveCredentials()
  const tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  })

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  const data = (await response.json()) as {
    access_token?: string
    expires_in?: number
    error?: string
    error_description?: string
  }

  if (!response.ok || !data.access_token) {
    const message =
      data.error_description ?? data.error ?? `Graph token request failed (${response.status})`
    const error = new Error(message)
    captureError(error, {
      location: 'lib/graph',
      type: 'graph_token_error',
      extra: { status: response.status, tenantId },
    })
    throw error
  }

  const expiresInMs = (data.expires_in ?? 3600) * 1000
  cachedToken = {
    token: data.access_token,
    expiresAt: now + expiresInMs,
  }
  return data.access_token
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function isAbsoluteUrl(path: string): boolean {
  return /^https?:\/\//i.test(path)
}

function buildGraphUrl(pathOrUrl: string): string {
  if (isAbsoluteUrl(pathOrUrl)) return pathOrUrl
  const suffix = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`
  return `${GRAPH_BASE_URL}${suffix}`
}

/**
 * Thin wrapper around fetch that injects the Graph bearer token, retries on 429
 * honouring Retry-After, and throws a descriptive Error on non-OK responses.
 */
export async function graphFetch<T>(pathOrUrl: string, init?: RequestInit): Promise<T> {
  const url = buildGraphUrl(pathOrUrl)

  let attempt = 0
  while (true) {
    const token = await getGraphAppToken()
    const headers = new Headers(init?.headers)
    headers.set('Authorization', `Bearer ${token}`)
    if (!headers.has('Accept')) headers.set('Accept', 'application/json')

    const response = await fetch(url, { ...init, headers })

    if (response.status === 429 && attempt < MAX_RETRIES) {
      const retryAfterRaw = response.headers.get('Retry-After')
      const retryAfterSeconds = retryAfterRaw ? parseInt(retryAfterRaw, 10) : NaN
      const waitMs = Number.isFinite(retryAfterSeconds)
        ? retryAfterSeconds * 1000
        : 2 ** attempt * 500
      attempt += 1
      await sleep(waitMs)
      continue
    }

    if (!response.ok) {
      const bodyText = await response.text().catch(() => '')
      const error = new Error(
        `Graph request failed ${response.status} ${response.statusText}: ${bodyText.slice(0, 500)}`,
      )
      captureError(error, {
        location: 'lib/graph',
        type: 'graph_request_error',
        extra: { url, status: response.status },
      })
      throw error
    }

    if (response.status === 204) {
      return undefined as T
    }

    return (await response.json()) as T
  }
}

export interface EntraGroupMember {
  id: string
  displayName?: string | null
  givenName?: string | null
  surname?: string | null
  mail?: string | null
  userPrincipalName?: string | null
  accountEnabled?: boolean | null
  /** Sokrates person id (same value NM exposes as `Student_ID`). Null for staff/shared accounts. */
  employeeId?: string | null
  '@odata.type'?: string
}

interface GraphListResponse<T> {
  value: T[]
  '@odata.nextLink'?: string
}

export interface ListGroupMembersOptions {
  select?: string[]
  pageSize?: number
  /**
   * When true, reads transitive members (nested groups flattened).
   * Useful when class groups contain sub-groups with the actual users.
   */
  transitive?: boolean
}

/**
 * Async generator over a group's members. Only user objects are yielded; nested
 * groups and service principals are filtered out. Honours @odata.nextLink paging.
 */
export async function* listGroupMembers(
  groupId: string,
  options: ListGroupMembersOptions = {},
): AsyncGenerator<EntraGroupMember, void, void> {
  if (!groupId) {
    throw new Error('listGroupMembers requires a non-empty groupId')
  }

  const select = options.select ?? [
    'id',
    'displayName',
    'givenName',
    'surname',
    'mail',
    'userPrincipalName',
    'accountEnabled',
    'employeeId',
  ]

  const params = new URLSearchParams()
  params.set('$select', select.join(','))
  if (options.pageSize && Number.isFinite(options.pageSize)) {
    params.set('$top', String(Math.max(1, Math.min(999, Math.floor(options.pageSize)))))
  }

  const memberPath = options.transitive ? 'transitiveMembers' : 'members'
  let nextUrl: string | undefined =
    `/groups/${encodeURIComponent(groupId)}/${memberPath}/microsoft.graph.user?${params.toString()}`

  while (nextUrl) {
    const page: GraphListResponse<EntraGroupMember> = await graphFetch(nextUrl)
    for (const entry of page.value ?? []) {
      yield entry
    }
    nextUrl = page['@odata.nextLink']
  }
}

/**
 * Convenience helper that materialises all members of a group into an array.
 */
export async function collectGroupMembers(
  groupId: string,
  options: ListGroupMembersOptions = {},
): Promise<EntraGroupMember[]> {
  const out: EntraGroupMember[] = []
  for await (const member of listGroupMembers(groupId, options)) {
    out.push(member)
  }
  return out
}

export interface EntraGroup {
  id: string
  displayName: string | null
  description: string | null
  mailNickname: string | null
  mailEnabled?: boolean | null
  securityEnabled?: boolean | null
  groupTypes?: string[] | null
  onPremisesSyncEnabled?: boolean | null
}

export interface ListGroupsOptions {
  /** Optional OData $filter passthrough (e.g. `startswith(displayName,'Class')`). */
  filter?: string
  /** Optional OData $search passthrough. Requires ConsistencyLevel: eventual header which we set automatically. */
  search?: string
  pageSize?: number
}

/**
 * Async generator over all groups the app can see. Honours @odata.nextLink paging
 * and applies optional $filter/$search. $search requires the `ConsistencyLevel:
 * eventual` header which is injected automatically.
 */
export async function* listGroups(
  options: ListGroupsOptions = {},
): AsyncGenerator<EntraGroup, void, void> {
  const params = new URLSearchParams()
  params.set(
    '$select',
    'id,displayName,description,mailNickname,mailEnabled,securityEnabled,groupTypes,onPremisesSyncEnabled',
  )
  if (options.pageSize && Number.isFinite(options.pageSize)) {
    params.set('$top', String(Math.max(1, Math.min(999, Math.floor(options.pageSize)))))
  }
  if (options.filter) {
    params.set('$filter', options.filter)
  }
  if (options.search) {
    params.set('$search', options.search)
  }

  const init: RequestInit | undefined = options.search
    ? { headers: { ConsistencyLevel: 'eventual' } }
    : undefined

  let nextUrl: string | undefined = `/groups?${params.toString()}`

  while (nextUrl) {
    const page: GraphListResponse<EntraGroup> = await graphFetch(nextUrl, init)
    for (const entry of page.value ?? []) {
      yield entry
    }
    nextUrl = page['@odata.nextLink']
  }
}

/**
 * Convenience helper that materialises all groups into an array.
 */
export async function collectGroups(options: ListGroupsOptions = {}): Promise<EntraGroup[]> {
  const out: EntraGroup[] = []
  for await (const group of listGroups(options)) {
    out.push(group)
  }
  return out
}

/**
 * Fetch metadata for a single group by id. Returns null if the group is missing
 * (404) rather than throwing, so callers can treat deletion as a soft signal.
 */
export async function getGroup(groupId: string): Promise<EntraGroup | null> {
  if (!groupId) {
    throw new Error('getGroup requires a non-empty groupId')
  }
  const params = new URLSearchParams()
  params.set(
    '$select',
    'id,displayName,description,mailNickname,mailEnabled,securityEnabled,groupTypes,onPremisesSyncEnabled',
  )

  try {
    return await graphFetch<EntraGroup>(
      `/groups/${encodeURIComponent(groupId)}?${params.toString()}`,
    )
  } catch (error) {
    if (error instanceof Error && /\b404\b/.test(error.message)) {
      return null
    }
    throw error
  }
}

/** Graph caps `checkMemberGroups` at 20 group ids per request. */
const CHECK_MEMBER_GROUPS_CHUNK = 20

/**
 * Returns the subset of {@link groupIds} the user is a member of, transitively.
 *
 * Uses the app-only token rather than the signed-in user's delegated token, so
 * it needs no consent beyond the app registration's own `GroupMember.Read.All`
 * and works outside a request scope (role refresh, background sync). Being
 * transitive, it agrees with the `transitiveMembers` expansion used by class
 * sync — a delegated `/me/memberOf` call returns direct memberships only, so a
 * student in a nested group would sync but fail to log in.
 *
 * Group ids are chunked to respect the Graph limit; an empty input short
 * circuits without a request.
 */
export async function checkMemberGroups(
  userId: string,
  groupIds: readonly string[],
): Promise<string[]> {
  const trimmedUserId = userId?.trim()
  if (!trimmedUserId) {
    throw new Error('checkMemberGroups requires a non-empty userId')
  }

  const unique = Array.from(new Set(groupIds.map(id => id.trim()).filter(Boolean)))
  if (unique.length === 0) return []

  const matched = new Set<string>()

  for (let index = 0; index < unique.length; index += CHECK_MEMBER_GROUPS_CHUNK) {
    const chunk = unique.slice(index, index + CHECK_MEMBER_GROUPS_CHUNK)
    const response = await graphFetch<{ value?: string[] }>(
      `/users/${encodeURIComponent(trimmedUserId)}/checkMemberGroups`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupIds: chunk }),
      },
    )
    for (const id of response.value ?? []) {
      matched.add(id)
    }
  }

  return Array.from(matched)
}

export interface GraphUserPhoto {
  bytes: Buffer
  contentType: string
}

/**
 * Fetches a user's profile photo from Graph.
 * Returns null when the user has no profile photo (404).
 */
export async function getUserPhoto(userId: string): Promise<GraphUserPhoto | null> {
  if (!userId?.trim()) {
    throw new Error('getUserPhoto requires a non-empty userId')
  }

  const encodedUserId = encodeURIComponent(userId.trim())
  const url = buildGraphUrl(`/users/${encodedUserId}/photo/$value`)
  let attempt = 0

  while (true) {
    const token = await getGraphAppToken()
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    if (response.status === 404) {
      return null
    }

    if (response.status === 429 && attempt < MAX_RETRIES) {
      const retryAfterRaw = response.headers.get('Retry-After')
      const retryAfterSeconds = retryAfterRaw ? parseInt(retryAfterRaw, 10) : NaN
      const waitMs = Number.isFinite(retryAfterSeconds)
        ? retryAfterSeconds * 1000
        : 2 ** attempt * 500
      attempt += 1
      await sleep(waitMs)
      continue
    }

    if (!response.ok) {
      const bodyText = await response.text().catch(() => '')
      const error = new Error(
        `Graph photo request failed ${response.status} ${response.statusText}: ${bodyText.slice(0, 500)}`,
      )
      captureError(error, {
        location: 'lib/graph',
        type: 'graph_user_photo_error',
        extra: { userId, status: response.status },
      })
      throw error
    }

    const contentType = response.headers.get('content-type') ?? 'image/jpeg'
    const arrayBuffer = await response.arrayBuffer()
    return {
      bytes: Buffer.from(arrayBuffer),
      contentType,
    }
  }
}
