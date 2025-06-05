import * as Sentry from "@sentry/nextjs";

interface SentryErrorOptions {
  location: string;
  type: string;
  extra?: Record<string, unknown>;
}

export function captureError(error: unknown, options: SentryErrorOptions) {
  if (error instanceof Error) {
    Sentry.captureException(error, {
      tags: {
        location: options.location,
        type: options.type,
      },
      extra: options.extra,
    });
  } else {
    Sentry.captureMessage('Unknown error occurred', {
      level: 'error',
      tags: {
        location: options.location,
        type: options.type,
      },
      extra: {
        ...options.extra,
        error,
      },
    });
  }
}

export async function withSentryErrorReporting<T>(
  operation: () => Promise<T>,
  options: SentryErrorOptions
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    captureError(error, options);
    throw error;
  }
} 