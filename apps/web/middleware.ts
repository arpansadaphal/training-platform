
// apps/web/middleware.ts
//
// Edge middleware — rate limiting (ARCH-048).
//
// Runs in the Edge runtime (the default for Next.js middleware — do not
// set `runtime: 'nodejs'`; Edge is the correct runtime for a rate
// limiter). Must not import from @training/config or any package that
// pulls Node-only code into the bundle. Env vars are read from
// process.env directly; see ../src/lib/rateLimit.ts for the same note.
//
// The middleware runs BEFORE application code — before the tRPC route
// handler, before Auth.js, before any service. This ordering is the
// point: a rate-limited request never reaches application code, so the
// limiter's cost is paid at the edge and the app's per-request work is
// not.
//
// Failure mode: FAIL OPEN. If Upstash is unreachable or misconfigured,
// the request is allowed and the failure is logged. A broken limiter
// must not take the product offline.

import { NextResponse, type NextRequest } from "next/server";
import {
  checkRateLimit,
  classifyRequest,
  deriveIdentifier,
} from "./src/lib/rateLimit";

export const config = {
  // The matcher is the outer scope of the middleware — anything outside
  // these prefixes never enters the Edge function at all. Static assets,
  // RSC navigations, and the HTML app shell are not rate-limited here.
  matcher: ["/api/trpc/:path*", "/api/auth/:path*"],
};

export async function middleware(req: NextRequest): Promise<NextResponse> {
  try {
    const pathname = req.nextUrl.pathname;
    const category = classifyRequest(pathname);

    // Defensive: the matcher already scopes to the two prefixes we
    // classify, so `null` should not occur. If it ever does, skip.
    if (!category) return NextResponse.next();

    const identifier = await deriveIdentifier(req);
    const result = await checkRateLimit(category, identifier);

    // null = fail open (Upstash unconfigured, network error, quota
    // exhausted). checkRateLimit already logged the reason.
    if (!result) return NextResponse.next();

    if (result.success) {
      const res = NextResponse.next();
      res.headers.set("X-RateLimit-Limit", String(result.limit));
      res.headers.set("X-RateLimit-Remaining", String(result.remaining));
      res.headers.set("X-RateLimit-Reset", String(result.reset));
      return res;
    }

    // Rate-limited. Return 429 with a JSON body so a tRPC client
    // rendering the error gets something legible; headers carry the
    // policy so a client can display a "try again in Ns" hint.
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((result.reset - Date.now()) / 1000),
    );

    return new NextResponse(
      JSON.stringify({
        error: "Too many requests. Please slow down and try again shortly.",
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "X-RateLimit-Limit": String(result.limit),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(result.reset),
          "Retry-After": String(retryAfterSeconds),
        },
      },
    );
  } catch (err) {
    // Defensive: checkRateLimit catches internally, so a throw here
    // indicates a bug in classification or header handling. Fail open
    // rather than 500 the request — a broken middleware should never
    // take the API offline.
    console.error(
      "[ratelimit] middleware threw — failing open",
      err instanceof Error ? err.message : String(err),
    );
    return NextResponse.next();
  }
}