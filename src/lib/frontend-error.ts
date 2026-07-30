interface FrontendErrorOptions {
  location: string
  type: string
  extra?: Record<string, unknown>
  user?: {
    id?: string
    email?: string
  }
}

/**
 * Reports a browser-side error to `/api/client-errors`, which lands it in the
 * same `ErrorLog` table the server writes to (Admin → Fehlerprotokoll).
 *
 * Fire-and-forget and swallowed: reporting an error must never throw a new one,
 * and it is a no-op during SSR (no `window`/`fetch` request scope).
 */
export function captureFrontendError(error: unknown, options: FrontendErrorOptions): void {
  if (typeof window === 'undefined') return

  const payload = {
    location: options.location,
    type: options.type,
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    context: options.extra,
    path: window.location?.pathname,
  }

  void fetch('/api/client-errors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {
    // Reporting is best-effort; never surface a failure to report.
  })
}

/**
 * Runs an async operation, reporting any error before rethrowing.
 */
export async function withFrontendErrorReporting<T>(
  operation: () => Promise<T>,
  options: FrontendErrorOptions,
): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    captureFrontendError(error, options)
    throw error
  }
}

/**
 * Runs an async operation, reporting any error and resolving to `null` instead
 * of throwing.
 */
export async function tryWithErrorReporting<T>(
  operation: () => Promise<T>,
  options: FrontendErrorOptions,
): Promise<T | null> {
  try {
    return await operation()
  } catch (error) {
    captureFrontendError(error, options)
    return null
  }
}
