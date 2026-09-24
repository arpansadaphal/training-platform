import * as Sentry from "@sentry/nextjs";

/**
 * Next.js calls register() once per server runtime. Loads the matching
 * Sentry config for Node.js and Edge runtimes.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

/** Forwards server-side request errors (RSC render, route handlers) to Sentry. */
export const onRequestError = Sentry.captureRequestError;