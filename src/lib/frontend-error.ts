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

export function withFrontendErrorReporting<T>(
  operation: () => Promise<T>,
  options: FrontendErrorOptions
): Promise<T> {
  try {
    return operation();
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