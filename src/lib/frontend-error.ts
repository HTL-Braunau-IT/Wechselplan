interface FrontendErrorOptions {
  location: string;
  type: string;
  extra?: Record<string, unknown>;
  user?: {
    id?: string;
    email?: string;
  };
}

/**
 * Reports a frontend error (no-op - Sentry has been removed).
 *
 * @param error - The error to report, which may be any value.
 * @param options - Contextual information for tagging and enriching the error report.
 */
export function captureFrontendError(_error: unknown, _options: FrontendErrorOptions) {
  // Do nothing - Sentry has been removed
}

/**
 * Executes an asynchronous operation (no error reporting - Sentry has been removed).
 *
 * @param operation - The asynchronous operation to execute.
 * @param options - Error reporting options (ignored).
 * @returns The result of the operation if it succeeds.
 *
 * @throws Rethrows any error thrown by the operation.
 */
export async function withFrontendErrorReporting<T>(
  operation: () => Promise<T>,
  _options: FrontendErrorOptions
): Promise<T> {
  return await operation();
}

// Utility function to wrap async operations in try-catch (no error reporting)
export async function tryWithErrorReporting<T>(
  operation: () => Promise<T>,
  _options: FrontendErrorOptions
): Promise<T | null> {
  try {
    return await operation();
  } catch {
    return null;
  }
}
