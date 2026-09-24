import * as Sentry from "@sentry/nextjs";

console.log("[Sentry] server config running. DSN set:", Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN));

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
  debug: false,
});