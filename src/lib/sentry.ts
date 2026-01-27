interface SentryErrorOptions {
  location: string;
  type: string;
  extra?: Record<string, unknown>;
}

// No-op implementation - Sentry has been removed
export function captureError(_error: unknown, _options: SentryErrorOptions) {
  // Do nothing - Sentry has been removed
}

export async function withSentryErrorReporting<T>(
  operation: () => Promise<T>,
  _options: SentryErrorOptions
): Promise<T> {
  // Just execute the operation without error reporting
  return await operation();
}
