"use client";

import NextError from "next/error";

/**
 * Displays a generic error page in a Next.js application.
 *
 * @param error - The error object to display.
 * @param reset - A callback intended to reset error state, though not used within this component.
 *
 * @remark
 * Always renders a generic error message because the App Router does not provide HTTP status codes for errors.
 */
export default function GlobalError({
  error: _error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Error logging removed - Sentry has been removed

  return (
    <html>
      <body>
        {/* `NextError` is the default Next.js error page component. Its type
        definition requires a `statusCode` prop. However, since the App Router
        does not expose status codes for errors, we simply pass 0 to render a
        generic error message. */}
        <NextError statusCode={0} />
      </body>
    </html>
  );
}