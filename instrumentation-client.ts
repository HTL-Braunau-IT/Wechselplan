import * as Sentry from "@sentry/nextjs";

export function init() {
  Sentry.init({
    dsn: "http://sentry.htl-braunau.at/",
    tracesSampleRate: 1.0,
    replaysOnErrorSampleRate: 1.0,
    replaysSessionSampleRate: 0.1,
  });
} 