import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

export const dynamic = "force-dynamic";
class SentryExampleAPIError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SentryExampleAPIError";
  }
}
/**
 * Handles GET requests for the API route, simulating an error to test Sentry error monitoring.
 *
 * Returns a 404 error in production environments to disable the route. In non-production environments, intentionally throws and captures a custom error, reporting it to Sentry and returning a 500 error response.
 *
 * @returns A JSON response with an error message and appropriate HTTP status code.
 *
 * @remark This route is disabled in production and only triggers Sentry error reporting in non-production environments.
 */
export function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Disabled in production' }, { status: 404 });
  }
  try {
    throw new SentryExampleAPIError("This error is raised on the backend called by the example page.");
  } catch (error) {
    // Capture the error in Sentry
    Sentry.captureException(error);
    return NextResponse.json(
      { error: "An error occurred and was reported to Sentry" },
      { status: 500 }
    );
  }
}
