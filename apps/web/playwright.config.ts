import { defineConfig, devices } from "@playwright/test";

/**
 * Phase 0 had exactly one E2E test (landing). Phase 4 adds the Builder flow,
 * which navigates through several routes and Server Actions — each of which
 * pays a lazy first-compile cost in `next dev` (routinely 2-6s per route on
 * a cold server). The default per-assertion timeout of 5s is not enough for
 * a cold run.
 *
 * `expect.timeout: 15_000` raises the ceiling for every assertion in every
 * test. It is not so long that a genuine hang goes unnoticed, and not so
 * short that a cold-compile response arrives after the assertion has given
 * up. Warm dev servers finish assertions in well under 1s, so the higher
 * ceiling costs nothing on subsequent runs.
 *
 * The long-term fix — for when the E2E suite grows enough that cold-compile
 * latency is more painful than a pre-test build — is to change the
 * webServer.command from `pnpm dev` to `pnpm build && pnpm start`. Noted in
 * PROJECT_STATE.md as a Phase 5+ candidate; not done here because it makes
 * every local test run pay a full production build.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",
  expect: {
    timeout: 15_000,
  },
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});