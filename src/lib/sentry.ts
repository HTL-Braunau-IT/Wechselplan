import { NextResponse } from 'next/server'
import { recordError } from '@/lib/error-log'

/**
 * Server-side error capture.
 *
 * Sentry was removed; instead of a no-op we persist to the `ErrorLog` table so
 * admins read failures in the in-app Fehlerprotokoll (Admin → error log)
 * without shelling into the host. Persistence is **best-effort and
 * fire-and-forget**: `captureError` returns immediately and never throws, so a
 * logging failure can never break the request it is reporting on (see
 * {@link recordError}, which additionally falls back to stdout).
 *
 * The `location`/`type`/`extra` contract is unchanged, so existing call sites
 * keep working. `extra` is redacted before it is stored — keep passing only
 * safe fields, never raw request bodies or grades.
 */
interface SentryErrorOptions {
  location: string
  type: string
  extra?: Record<string, unknown>
}

export function captureError(error: unknown, options: SentryErrorOptions): void {
  void recordError({
    source: 'server',
    location: options.location,
    type: options.type,
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : null,
    context: options.extra ?? null,
  })
}

/**
 * Wraps a route handler so any thrown error is captured under `location` and
 * turned into a 500, replacing the per-handler `try/catch → captureError`
 * boilerplate. Pulls the request path/method from the first argument when it is
 * a `Request`.
 */
export function withErrorHandling<A extends unknown[]>(
  location: string,
  handler: (...args: A) => Promise<Response> | Response,
): (...args: A) => Promise<Response> {
  return async (...args: A): Promise<Response> => {
    try {
      return await handler(...args)
    } catch (error) {
      const request = args[0]
      const isRequest = request instanceof Request
      void recordError({
        source: 'server',
        location,
        type: 'unhandled',
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : null,
        path: isRequest ? new URL(request.url).pathname : null,
        method: isRequest ? request.method : null,
      })
      return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
  }
}

/**
 * Runs `operation`, capturing any error under `options` before rethrowing.
 * Retained for the few call sites that wrap a non-handler operation.
 */
export async function withSentryErrorReporting<T>(
  operation: () => Promise<T>,
  options: SentryErrorOptions,
): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    captureError(error, options)
    throw error
  }
}
