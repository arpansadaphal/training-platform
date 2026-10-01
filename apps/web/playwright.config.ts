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
 * CI WEBSERVER MODE (Phase 9 fix): in CI, the workflow's earlier
 * `pnpm turbo run build` step produces a `.next/` directory that contains a
 * production build. Playwright's webServer then runs. If the command were
 * `pnpm dev`, `next dev` would see the production `.next/`, partially
 * clobber it, and serve HTML whose client chunks 404 — the page URL updates
 * but React never hydrates and no client-rendered element ever appears.
 * That is the exact failure the first E2E-in-CI run hit: every timeout was
 * "URL correct, placeholder never appeared." In CI the command is therefore
 * `pnpm start` (`next start`), which serves the build the earlier step
 * already validated, in the mode it was built for. Locally `process.env.CI`
 * is unset and the command stays `pnpm dev`, which is the right developer
 * experience (hot reload, no pre-build).
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
    // See the header comment. In CI, serve the production build the
    // workflow's `Build` step already produced. Locally, run dev.
    command: process.env.CI ? "pnpm start" : "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});