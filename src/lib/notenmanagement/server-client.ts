import { env } from '@/env'

/**
 * Server-side HTTP client for the external Notenmanagement REST API.
 *
 * This is the single place that talks to Notenmanagement over the network. It
 * replaces the token/fetch helpers that were copy-pasted across the transfer,
 * preview and view route handlers. The browser never calls Notenmanagement
 * directly — it calls our own routes, which use this module.
 *
 * Auth is OAuth 2.0 password grant (`POST /Token`); the returned bearer token is
 * sent as `Authorization: bearer <token>`. Two callers exist:
 *  - the individual teacher (grade transfer — LFs are attributed to them), and
 *  - the stored service account (Matrikelnummer link sync — reads /api/Schueler).
 */

/**
 * Bound every outbound call so a slow/unresponsive Notenmanagement endpoint can
 * never hang the request handler indefinitely (these run synchronously inside the
 * transfer/preview/view/link-sync/test-connection routes).
 */
const NM_TIMEOUT_MS = 20_000

/** Ensure the configured base URL ends in a slash so `new URL(path, base)` keeps the `/work/rest/` prefix. */
function baseUrl(): string {
  const raw = env.NOTENMANAGEMENT_BASE_URL
  return raw.endsWith('/') ? raw : `${raw}/`
}

/** Resolve an API path (e.g. `api/Schueler`, `Token`) against the configured base. */
export function nmUrl(path: string): string {
  return new URL(path.replace(/^\//, ''), baseUrl()).toString()
}

export class NmApiError extends Error {
  status: number
  details?: unknown
  constructor(message: string, status: number, details?: unknown) {
    super(message)
    this.name = 'NmApiError'
    this.status = status
    this.details = details
  }
}

/** Thrown when the password grant is rejected (bad/expired credentials). */
export class NmAuthError extends NmApiError {
  constructor(message = 'Notenmanagement authentication failed', details?: unknown) {
    super(message, 401, details)
    this.name = 'NmAuthError'
  }
}

export interface NmTokenResult {
  token: string
  expiresIn: number
  role: string | null
  userName: string | null
}

interface NmTokenResponse {
  access_token?: string
  expires_in?: number
  role?: string
  userName?: string
  error?: string
  error_description?: string
}

/** Obtain a bearer token via the password grant. */
export async function getNmToken(username: string, password: string): Promise<NmTokenResult> {
  const res = await fetch(nmUrl('Token'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'password', username, password }),
    signal: AbortSignal.timeout(NM_TIMEOUT_MS),
  })
  const data = (await res.json().catch(() => ({}))) as NmTokenResponse
  if (!res.ok || !data.access_token) {
    throw new NmAuthError(
      data.error_description ?? data.error ?? 'Notenmanagement authentication failed',
      data,
    )
  }
  return {
    token: data.access_token,
    expiresIn: data.expires_in ?? 3600,
    role: data.role ?? null,
    userName: data.userName ?? null,
  }
}

async function parseBody(res: Response): Promise<unknown> {
  const contentType = res.headers.get('content-type') ?? ''
  return contentType.includes('application/json') ? res.json() : res.text()
}

/** Authenticated GET returning parsed JSON. Throws {@link NmApiError} on non-2xx. */
export async function nmGet<T>(path: string, token: string): Promise<T> {
  const res = await fetch(nmUrl(path), {
    headers: { Authorization: `bearer ${token}` },
    signal: AbortSignal.timeout(NM_TIMEOUT_MS),
  })
  const body = await parseBody(res)
  if (!res.ok) {
    throw new NmApiError(`Notenmanagement GET ${path} failed (${res.status})`, res.status, body)
  }
  return body as T
}

export interface NmSendResult {
  ok: boolean
  status: number
  body: unknown
}

/** Authenticated JSON write (POST/PUT). Returns the raw result rather than throwing, so callers can self-heal. */
export async function nmSend(
  method: 'POST' | 'PUT',
  path: string,
  token: string,
  payload: unknown,
): Promise<NmSendResult> {
  const res = await fetch(nmUrl(path), {
    method,
    headers: { Authorization: `bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(NM_TIMEOUT_MS),
  })
  return { ok: res.ok, status: res.status, body: await parseBody(res) }
}

/**
 * A student as returned by `GET /api/Schueler`. `Student_ID` is the Sokrates id
 * (identical to the Entra `employeeId` stored on `Student.sokratesId`).
 */
export interface NmStudent {
  Matrikelnummer: number
  Student_ID?: string
  Nachname?: string
  Vorname?: string
  Klasse?: string
  EMailAdresse1?: string
  EMailAdresse2?: string
}

/** Fetch every student the authenticated teacher can see. */
export async function fetchNmStudents(token: string): Promise<NmStudent[]> {
  const data = await nmGet<NmStudent[]>('api/Schueler', token)
  return Array.isArray(data) ? data : []
}

/** Extract an LF id from a POST/PUT response body regardless of casing. */
export function extractLfId(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null
  const record = body as Record<string, unknown>
  const id = record.LF_ID ?? record.Lf_ID ?? record.id ?? record.Id
  return typeof id === 'number' || typeof id === 'string' ? String(id) : null
}
