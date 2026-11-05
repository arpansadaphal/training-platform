// apps/web/src/lib/rateLimitMemory.ts
//
// TEST-ONLY in-process sliding-window limiter (ARCH-064). It exists so the
// Program Checker's 20-per-hour limit can be exercised in Playwright without
// an Upstash database. It is OFF unless RATE_LIMIT_DRIVER=memory, and it
// refuses to turn on when VERCEL_ENV=production, so a stray env var cannot
// replace the real limiter in production.
//
// State lives in module scope, so it is per server process and resets on
// restart; that is the intent. Edge-safe: no Node APIs.

export interface MemoryLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
}

const hits = new Map<string, number[]>();

export function memoryDriverEnabled(): boolean {
  return process.env.RATE_LIMIT_DRIVER === "memory" && process.env.VERCEL_ENV !== "production";
}

/** Same contract as Ratelimit.slidingWindow: at most `limit` hits in any `windowMs`. */
export function memoryLimit(key: string, limit: number, windowMs: number, now: number = Date.now()): MemoryLimitResult {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return { success: false, limit, remaining: 0, reset: recent[0]! + windowMs };
  }
  recent.push(now);
  hits.set(key, recent);
  return { success: true, limit, remaining: limit - recent.length, reset: recent[0]! + windowMs };
}

export function resetMemoryLimits(): void {
  hits.clear();
}
