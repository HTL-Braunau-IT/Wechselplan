const Sentry = require("@sentry/nextjs");

Sentry.init({
  dsn: "http://sentry.htl-braunau.at/",
  tracesSampleRate: 1.0,
}); 