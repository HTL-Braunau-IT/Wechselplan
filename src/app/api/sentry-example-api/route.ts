import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

export const dynamic = "force-dynamic";
class SentryExampleAPIError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SentryExampleAPIError";
  }
}
// A faulty API route to test Sentry's error monitoring
export function GET() {
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
