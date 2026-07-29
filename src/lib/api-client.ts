/**
 * Small fetch wrapper for the app's own API.
 *
 * The same "check res.ok, pull `error` off the body, fall back to a status
 * string" block was written out roughly thirty times across the client code,
 * each with its own wording. One helper means one error shape and one place to
 * change how failures surface.
 */

export class ApiError extends Error {
  readonly status: number
  readonly url: string

  constructor(message: string, status: number, url: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.url = url
  }
}

export interface ApiFetchOptions extends RequestInit {
  /** Prefixed to the server's message, e.g. "Klassen konnten nicht geladen werden". */
  errorMessage?: string
}

async function readError(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: unknown } | null
  if (body && typeof body.error === 'string' && body.error.trim()) {
    return body.error
  }
  return `${fallback} (${response.status})`
}

/**
 * Performs a request and returns the parsed JSON body, throwing {@link ApiError}
 * on a non-OK response. A 204 resolves to `undefined`.
 */
export async function apiFetch<T = unknown>(
  url: string,
  { errorMessage = 'Anfrage fehlgeschlagen', ...init }: ApiFetchOptions = {},
): Promise<T> {
  const response = await fetch(url, init)

  if (!response.ok) {
    throw new ApiError(await readError(response, errorMessage), response.status, url)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}

/** Convenience wrapper for JSON request bodies. */
export function apiSend<T = unknown>(
  url: string,
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  body?: unknown,
  options: ApiFetchOptions = {},
): Promise<T> {
  return apiFetch<T>(url, {
    ...options,
    method,
    headers: { 'Content-Type': 'application/json', ...options.headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

/** Message for a caught error, whatever its shape. */
export function errorMessageOf(error: unknown, fallback = 'Unbekannter Fehler'): string {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string' && error) return error
  return fallback
}
