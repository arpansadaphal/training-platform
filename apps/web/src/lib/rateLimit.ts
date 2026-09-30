// apps/web/src/lib/rateLimit.ts
//
// Rate limiting policy for the Edge middleware (see ../middleware.ts).
//
// This file runs in the Edge runtime. It must not import from
// @training/config or any package that pulls Node-only code into the
// bundle — the config package's lazy-validation pattern depends on APIs
// that Edge does not provide. Env vars are read from process.env
// directly. If a future change wants config-layer validation for these
// vars, add a thin Edge-safe export rather than importing the existing
// one.
//
// The policy (ARCH-048):
//
//   /api/trpc/coach.postMessage  →  10 / min  (LLM cost — strictest)
//   /api/trpc/* (other)          → 120 / min  (ordinary CRUD)
//   /api/auth/*                  →  20 / min  (login/signup brute-force)
//
// The limiter is Upstash's sliding-window implementation over Upstash
// Redis (REST API — Edge-compatible). On failure — misconfigured env,
// network error, free-tier exhaustion — the limiter FAILS OPEN: the
// request is allowed, and the failure is logged. A broken limiter must
// not take the product offline.

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import type { NextRequest } from "next/server";

// ── Policy ──────────────────────────────────────────────────────────────

export type RateLimitCategory = "coach" | "trpc" | "auth";

interface Policy {
  limit: number;
  // Window must match @upstash/ratelimit's Duration string syntax,
  // e.g. "1 m" for one minute. See:
  // https://github.com/upstash/ratelimit#duration
  window: `${number} ${"s" | "m" | "h" | "d"}`;
  prefix: string;
}

export const RATE_LIMIT_POLICIES: Record<RateLimitCategory, Policy> = {
  coach: { limit: 10, window: "1 m", prefix: "rl:coach" },
  trpc: { limit: 120, window: "1 m", prefix: "rl:trpc" },
  auth: { limit: 20, window: "1 m", prefix: "rl:auth" },
};

// ── Classification ──────────────────────────────────────────────────────

/**
 * Maps a request pathname to a rate-limit category, or null if the path
 * is not one this middleware rate-limits.
 *
 * The tRPC path may carry comma-separated operation names when batched
 * via httpBatchLink (e.g. /api/trpc/program.listMine,draft.get). A
 * Coach message always travels alone as /api/trpc/coach.postMessage via
 * httpSubscriptionLink — subscriptions are never batched — but the
 * defensive `ops.includes(...)` check handles the theoretical future
 * case where a batch could contain a coach op.
 */
export function classifyRequest(pathname: string): RateLimitCategory | null {
  if (pathname.startsWith("/api/auth/")) return "auth";
  if (!pathname.startsWith("/api/trpc/")) return null;

  const ops = pathname.slice("/api/trpc/".length).split(",");
  if (ops.includes("coach.postMessage")) return "coach";
  return "trpc";
}

// ── Identifier ──────────────────────────────────────────────────────────

/**
 * Derives the rate-limit identifier from the request.
 *
 * Prefers the Auth.js session cookie (its __Secure- production form or
 * its plain dev form) over the client IP. The cookie VALUE identifies
 * the session: decoding the JWT to extract the numerical user id would
 * require AUTH_SECRET and a crypto library in the Edge runtime, with no
 * rate-limiting benefit — two requests from the same logged-in session
 * always share the same cookie value, and two different sessions never
 * do.
 *
 * The cookie value is hashed with SHA-256 (Web Crypto, available in
 * Edge) so the raw session token never enters Upstash's key-space or
 * any debug log. Only the first 16 hex characters (64 bits) are used;
 * the collision probability across the sessions a single 60-second
 * window sees is negligible.
 */
export async function deriveIdentifier(req: NextRequest): Promise<string> {
  const cookieValue =
    req.cookies.get("__Secure-authjs.session-token")?.value ??
    req.cookies.get("authjs.session-token")?.value;

  if (cookieValue) {
    return `u:${await sha256Hex(cookieValue)}`;
  }

  return `ip:${getClientIp(req)}`;
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex.slice(0, 16);
}

function getClientIp(req: NextRequest): string {
  // Vercel (and most reverse proxies) forward the client IP as the first
  // entry of x-forwarded-for. Fall back to a fixed sentinel if the header
  // is absent (direct connection in local dev) — the sentinel shares one
  // bucket, which is correct behaviour for a single-user dev environment.
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  return "unknown";
}

// ── Limiter construction + check ────────────────────────────────────────

// `undefined` = not yet resolved. `null` = resolved and unconfigured.
// Once resolved, the client is cached for the lifetime of the Edge
// function instance (each instance is short-lived; cold-start cost is
// a single Map construction).
let redisClient: Redis | null | undefined;

function getRedis(): Redis | null {
  if (redisClient !== undefined) return redisClient;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    redisClient = null;
    return null;
  }

  redisClient = new Redis({ url, token });
  return redisClient;
}

const limiterCache = new Map<RateLimitCategory, Ratelimit>();

function getLimiter(category: RateLimitCategory): Ratelimit | null {
  const cached = limiterCache.get(category);
  if (cached) return cached;

  const redis = getRedis();
  if (!redis) return null;

  const policy = RATE_LIMIT_POLICIES[category];
  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(policy.limit, policy.window),
    // analytics: false — the free tier's 10K commands/day is the launch
    // budget; analytics events eat into it for no MVP operational benefit.
    // Flip to true once a paid Upstash tier is in place.
    analytics: false,
    prefix: policy.prefix,
  });

  limiterCache.set(category, limiter);
  return limiter;
}

export interface RateLimitCheckResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
}

/**
 * Runs the limiter for a category. Returns null when the limiter is
 * unavailable (Upstash unconfigured, network error, quota exhausted) —
 * the caller should fail open in that case.
 */
export async function checkRateLimit(
  category: RateLimitCategory,
  identifier: string,
): Promise<RateLimitCheckResult | null> {
  const limiter = getLimiter(category);

  if (!limiter) {
    console.warn(
      `[ratelimit] Upstash not configured (UPSTASH_REDIS_REST_URL/TOKEN unset) — failing open for ${category}`,
    );
    return null;
  }

  try {
    const result = await limiter.limit(identifier);
    return {
      success: result.success,
      limit: result.limit,
      remaining: result.remaining,
      reset: result.reset,
    };
  } catch (err) {
    console.error(
      `[ratelimit] Upstash call failed for ${category} — failing open`,
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}