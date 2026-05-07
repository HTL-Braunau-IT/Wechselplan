export interface ApiErrorEnvelope {
  error?: {
    code?: string
    message?: string
    details?: unknown
  } | string
  message?: string
}

export function unwrapData<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return (payload as { data: T }).data
  }
  return payload as T
}

export function getApiErrorMessage(payload: unknown, fallback = 'Request failed'): string {
  if (!payload || typeof payload !== 'object') return fallback
  const candidate = payload as ApiErrorEnvelope & { error?: string }
  if (typeof candidate.error === 'string') return candidate.error
  if (candidate.error && typeof candidate.error === 'object' && typeof candidate.error.message === 'string') {
    return candidate.error.message
  }
  if (typeof candidate.message === 'string') return candidate.message
  return fallback
}

export async function parseJsonSafe(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

export async function fetchAndUnwrap<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init)
  const payload = await parseJsonSafe(response)
  if (!response.ok) {
    throw new Error(getApiErrorMessage(payload))
  }
  return unwrapData<T>(payload)
}
