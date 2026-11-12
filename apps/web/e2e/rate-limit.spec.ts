import { test, expect, type APIRequestContext } from "@playwright/test";

/**
 * The Program Checker's per-IP limit (20 / hour, ARCH-064).
 *
 * Two modes, picked by the server's environment:
 *   - default (Upstash unset, as in CI): the limiter FAILS OPEN, so a stream of checks is never refused.
 *   - RATE_LIMIT_DRIVER=memory: the in-process test driver is on, so the 21st check from one IP is a 429.
 * Run the second with:  RATE_LIMIT_DRIVER=memory pnpm --filter web test:e2e rate-limit.spec.ts
 * (the env must reach the server, so stop any dev server already running).
 */

const MEMORY = process.env.RATE_LIMIT_DRIVER === "memory";
const HASH = Buffer.from(JSON.stringify([["Push", [["Barbell Bench Press", 3, 8, 10]]]])).toString("base64url");
const ANALYZE = `/api/trpc/check.analyze?input=${encodeURIComponent(JSON.stringify({ hash: HASH }))}`;
const LIMIT_MESSAGE = "You've reached the limit for today. Create an account to continue checking programs.";

const analyze = (request: APIRequestContext, ip: string) => request.get(ANALYZE, { headers: { "x-forwarded-for": ip } });
const randomIp = () => `203.0.113.${Math.floor(Math.random() * 250) + 1}`;

test("fails open when Upstash is not configured", async ({ request }) => {
  test.skip(MEMORY || process.env.UPSTASH_REDIS_REST_URL != null, "only meaningful when no limiter is configured (CI default)");
  const ip = randomIp();
  for (let i = 0; i < 25; i++) {
    const response = await analyze(request, ip);
    expect(response.status(), `request ${i + 1}`).toBe(200);
  }
});

test("the 21st check from one IP is a 429 with the sign-up message", async ({ request }) => {
  test.skip(!MEMORY, "needs RATE_LIMIT_DRIVER=memory on the server");
  const ip = randomIp();
  for (let i = 0; i < 20; i++) {
    const response = await analyze(request, ip);
    expect(response.status(), `request ${i + 1}`).toBe(200);
  }
  const limited = await analyze(request, ip);
  expect(limited.status()).toBe(429);
  expect(await limited.json()).toEqual({ error: LIMIT_MESSAGE });
  expect(limited.headers()["retry-after"]).toBeDefined();

  // Another IP is unaffected, and so is every other procedure from the limited one.
  expect((await analyze(request, randomIp())).status()).toBe(200);
  const other = await request.get("/api/trpc/check.exercises", { headers: { "x-forwarded-for": ip } });
  expect(other.status()).toBe(200);
});

test("the result page shows the limit message instead of an assessment", async ({ page }) => {
  test.skip(!MEMORY, "needs RATE_LIMIT_DRIVER=memory on the server");
  const ip = randomIp();
  await page.context().setExtraHTTPHeaders({ "x-forwarded-for": ip });
  for (let i = 0; i < 20; i++) {
    expect((await analyze(page.request, ip)).status()).toBe(200);
  }
  await page.goto(`/check/${HASH}`);
  await expect(page.getByText(LIMIT_MESSAGE)).toBeVisible();
  await expect(page.getByText(/Fit: |Provisional fit/)).toHaveCount(0);
});
