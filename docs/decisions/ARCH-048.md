### ARCH-048 — Edge rate limiting via Upstash Redis, sliding window, hybrid key
Date: 2026-09-30 | Status: FROZEN | Reversible: Yes, contained to `apps/web/middleware.ts`, `apps/web/src/lib/rateLimit.ts`, and the two Upstash env vars
Decision: Rate limiting is enforced in `apps/web/middleware.ts` (Edge runtime) using `@upstash/ratelimit`'s sliding-window implementation over Upstash Redis. Policy is route-aware:

| Path pattern | Limit |
|---|---|
| `/api/trpc/coach.postMessage` | 10 / min |
| `/api/trpc/*` (other) | 120 / min |
| `/api/auth/*` | 20 / min |

The identifier is the session cookie's value when present (hashed with SHA-256, first 16 hex chars), else the first `x-forwarded-for` entry, else the sentinel `"unknown"`. The cookie value identifies the session without requiring `AUTH_SECRET` in the Edge bundle.

Failure mode: **fail open.** Upstash unconfigured, unreachable, or over quota → the request is allowed and the failure is logged. A broken limiter must not take the product offline. The free tier's 10K commands/day resets daily; exceeding it produces fail-open behaviour, not a hard block.

Rationale: The phase file requires "stricter limits on `coach.postMessage` than on ordinary CRUD, implemented at the edge." Upstash's REST API is Edge-compatible; the sliding-window limiter is a well-maintained, standard implementation. The hybrid key (session cookie → user; IP fallback) matches the phase file's "per-user, per-router-category" language while remaining functional for unauthenticated requests. The `X-RateLimit-*` response headers carry policy and remaining-count so a client can render a "try again in Ns" hint.

Alternatives considered:
  (a) Vercel's built-in rate limiting. Rejected at the time of writing — Vercel's rate-limiting feature is still in limited availability; Upstash is the well-established path with a compatible free tier and no per-project feature gate.
  (b) In-process rate limiting via a Map. Rejected — Vercel's serverless functions do not share process state between invocations, so an in-process limiter would be trivially ineffective.
  (c) Node-runtime middleware. Rejected — Edge is the correct runtime for a rate limiter; it runs at the edge before the request reaches any application code, and Node middleware is a Phase-10-or-later consideration if ever needed.
  (d) Fail-closed. Rejected at MVP — a broken limiter that takes the product offline is a worse failure mode than a temporarily ineffective limiter during a period of normal traffic. Revisit if abuse is observed.
  (e) A Vitest/Playwright test for the limiter. Rejected — Vitest cannot exercise middleware (a Next.js construct, not a Node module); Playwright would require real Upstash credentials, and mocking Upstash verifies the mock, not the limiter. The verification is a curl-based shell script (`apps/web/scripts/load-test-ratelimit.sh`) run manually against a running instance.

Consequence: `apps/web` gains `@upstash/ratelimit` and `@upstash/redis` dependencies. `turbo.json`'s `globalEnv` gains `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`. `.env.example` gains both. Vercel's env vars must be set for all environments (see `docs/LAUNCH_CHECKLIST.md` §4). The rate-limiting verification procedure and expected output are documented in `docs/LAUNCH_CHECKLIST.md` §10. If the free-tier quota proves insufficient, upgrade Upstash before considering a self-hosted Redis — the code change would be contained to `apps/web/src/lib/rateLimit.ts`.
