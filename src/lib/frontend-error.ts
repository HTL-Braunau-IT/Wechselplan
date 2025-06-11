import * as Sentry from '@sentry/nextjs';

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
 * Reports a frontend error to Sentry with contextual tags and optional user or extra data.
 *
 * If the error is not an instance of {@link Error}, a generic message is reported and the raw error value is included in the extra data.
 *
 * @param error - The error to report, which may be any value.
 * @param options - Contextual information for tagging and enriching the error report.
 */
export function captureFrontendError(error: unknown, options: FrontendErrorOptions) {
  if (error instanceof Error) {
    Sentry.captureException(error, {
      tags: {
        location: options.location,
        type: options.type,
      },
      extra: options.extra,
      user: options.user,
    });
  } else {
    Sentry.captureMessage('Unknown frontend error occurred', {
      level: 'error',
      tags: {
        location: options.location,
        type: options.type,
      },
      extra: {
        ...options.extra,
        error,
      },
      user: options.user,
    });
  }
}

/**
 * Executes an asynchronous operation and reports any errors to Sentry before rethrowing them.
 *
 * @param operation - The asynchronous operation to execute.
 * @param options - Error reporting options including location, type, and optional extra data or user information.
 * @returns The result of the {@link operation} if it succeeds.
 *
 * @throws Rethrows any error thrown by {@link operation} after reporting it.
 */
export async function withFrontendErrorReporting<T>(
  operation: () => Promise<T>,
  options: FrontendErrorOptions
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    captureFrontendError(error, options);
    throw error;
  }
}

// Utility function to wrap async operations in try-catch with Sentry reporting
export async function tryWithErrorReporting<T>(
  operation: () => Promise<T>,
  options: FrontendErrorOptions
): Promise<T | null> {
  try {
    return await operation();
  } catch (error) {
    captureFrontendError(error, options);
    return null;
  }
} 