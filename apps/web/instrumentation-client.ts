import * as Sentry from "@sentry/nextjs";

/**
 * Client-side Sentry initialization. Next.js 15 + @sentry/nextjs v8 loads
 * this file automatically in the browser bundle.
 */
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
  debug: false,
});