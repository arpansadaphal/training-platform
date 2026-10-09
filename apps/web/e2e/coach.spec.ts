// apps/web/e2e/coach.spec.ts
//
// The Phase 8 acceptance test: the Apply button does not auto-fire
// commitFromSimulation during streaming, and fires exactly once on click.
//
// Auth pattern matches training.spec.ts — each spec signs up a fresh user
// inline; there is no shared storageState fixture. Same DB-left-dirty policy
// as the other specs.
//
// PHASE 9 GATE CHANGE: the primary test was gated on ANTHROPIC_API_KEY
// (skipped in CI without a real key). It is now gated on MODEL_PROVIDER=mock,
// which CI sets job-wide. The MockProvider's "coach-regression" scenario
// (MOCK_SCENARIO=coach-regression) produces the same
// simulate_program_change → prepare_apply_confirmation sequence the real
// model produced in Phase 8, so the network-inspection assertion runs
// identically and now executes in CI. See ARCH-045 and the Phase 9 close-out.

import { test, expect, type Page, type Request } from "@playwright/test";

// Phase 9: gate on MODEL_PROVIDER=mock. CI sets this; local runs without it
// skip the gated test (the smoke tests below still run).
const COACH_RUNNABLE = process.env.MODEL_PROVIDER === "mock";

// ── Setup helpers (mirror training.spec.ts) ────────────────────────────

async function signUpFreshUser(page: Page): Promise<string> {
  const email = `phase8-coach-${crypto.randomUUID()}@example.test`;
  const password = "correct-horse-battery-staple";

  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/app$/, { timeout: 30_000 });
  return email;
}

async function createProgram(page: Page, name: string): Promise<string> {
  await page.goto("/app/programs");
  await page.getByPlaceholder("e.g. 4-day upper/lower").fill(name);
  await page.getByRole("button", { name: "Create" }).click();
  await page.waitForLoadState("networkidle");
  await page.reload();

  const programLink = page.getByRole("link", { name, exact: true });
  await expect(programLink).toBeVisible();
  const href = await programLink.getAttribute("href");
  if (!href) {
    throw new Error(`Program link "${name}" is visible but has no href`);
  }
  return href;
}

/**
 * Reach a Review page with an ACTIVE block, returning the URL. Commits a v1
 * the same way training.spec.ts does — signup → create program → build a
 * one-day draft → commit — then navigates to /app where the block strip
 * carries the Review link.
 */
async function reachReview(page: Page): Promise<void> {
  const programName = `E2E Coach ${Date.now()}`;
  await signUpFreshUser(page);

  const programHref = await createProgram(page, programName);
  await page.goto(programHref);

  // Build a minimal draft and commit it.
  await page.getByRole("link", { name: "Open Builder" }).click();
  await expect(page).toHaveURL(/\/app\/programs\/[^/]+\/build$/);

  await page.getByPlaceholder("Option B").fill("Option A");
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page.getByRole("heading", { name: /Option A/ })).toBeVisible();

  await page.getByRole("button", { name: "+ Add workout day" }).click();
  await page.getByLabel("Choose an exercise").selectOption({ index: 1 });
  await page.getByRole("button", { name: "Add exercise" }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();

  const assessmentPanel = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Assessment" }),
  });
  // Phase 10.2: HYPERTROPHY config is populated but validated: false, so the
  // panel renders the classification under the provisional banner rather than
  // the "not yet available" state. Assert both the banner and a real section
  // so a blank panel or a missing banner both fail.
  await expect(
    assessmentPanel.getByRole("note", { name: /provisional thresholds/i }),
  ).toBeVisible();
  await expect(assessmentPanel.getByRole("heading", { name: "Overall" })).toBeVisible();

  await page.getByRole("button", { name: "Commit", exact: true }).click();
  await expect(page.getByText(/Committed as version 1\./)).toBeVisible();

  // The /app landing page carries a block strip with the Review link. The
  // accessible name is "Review block" (see BlockStrip in app/app/page.tsx).
  await page.goto("/app");
  const reviewLink = page.getByRole("link", {
    name: "Review block",
    exact: true,
  });
  await expect(reviewLink).toBeVisible({ timeout: 30_000 });

  const reviewHref = await reviewLink.getAttribute("href");
  if (!reviewHref || !reviewHref.startsWith("/app/review/")) {
    throw new Error(`Review block link has unexpected href: ${reviewHref ?? "(null)"}`);
  }

  // Navigate directly rather than clicking. Under a cold dev server, a
  // client-side <Link> click can race hydration and leave the URL
  // unchanged; page.goto forces a full load and is not subject to that.
  await page.goto(reviewHref);
  await expect(page).toHaveURL(/\/app\/review\/[^/]+$/);
}

// ── Non-gated smoke tests ─────────────────────────────────────────────

test.describe("Coach surfaces (no model required)", () => {
  test("the /app/coach route renders a conversation sidebar", async ({ page }) => {
    test.setTimeout(180_000);

    await signUpFreshUser(page);
    await page.goto("/app/coach");

    await expect(page.getByRole("heading", { name: /coach/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /new/i })).toBeVisible();
  });

  test("the review screen renders the Coach panel beside the review body", async ({ page }) => {
    test.setTimeout(240_000);

    await reachReview(page);

    // The Coach panel and the review body are siblings in the layout.
    await expect(page.getByRole("heading", { name: "Coach" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Review" })).toBeVisible();

    // The input accepts text (not submitted here).
    const textarea = page.getByPlaceholder("Ask the Coach…");
    await expect(textarea).toBeVisible();
    await textarea.fill("ping");
    await expect(textarea).toHaveValue("ping");
  });
});

// ── Gated: the phase-file's network-inspection acceptance test ────────

test.describe("Coach apply-button boundary (requires MODEL_PROVIDER=mock)", () => {
  test.skip(
    !COACH_RUNNABLE,
    "requires MODEL_PROVIDER=mock (set in CI). The MockProvider's " +
      "coach-regression scenario produces the simulate → prepare_apply " +
      "sequence this test asserts against.",
  );

  test("commitFromSimulation fires only on explicit click, never during streaming", async ({
    page,
  }) => {
    test.setTimeout(180_000);

    // Track every HTTP request whose URL names the commit procedure. tRPC's
    // httpBatchLink encodes procedure names in the URL path, so a request
    // to /api/trpc/programVersion.commitFromSimulation (possibly as part of
    // a batch) matches this substring check.
    const commitRequests: Request[] = [];
    page.on("request", (req) => {
      if (req.url().includes("programVersion.commitFromSimulation")) {
        commitRequests.push(req);
      }
    });

    await reachReview(page);

    await expect(page.getByRole("heading", { name: "Coach" })).toBeVisible();

    // Send a message. Under the coach-regression scenario, the mock produces
    // a deterministic simulate → prepare_apply sequence regardless of the
    // text content; a descriptive prompt is still useful for debugging.
    const textarea = page.getByPlaceholder("Ask the Coach…");
    await textarea.fill(
      "Please simulate adding one set to the first exercise, then offer " +
        "me the button to apply it. Use the tools available.",
    );
    await page.getByRole("button", { name: /^Send$/ }).click();

    // Wait for the Apply button to appear. The mock is deterministic and
    // fast; a generous timeout still guards against a dev-server cold start
    // mid-test.
    const applyButton = page.getByRole("button", {
      name: /apply this change/i,
    });
    await expect(applyButton).toBeVisible({ timeout: 90_000 });

    // ── ASSERTION 1 ───────────────────────────────────────────────────
    // During the entire streaming phase and up to the button's appearance,
    // NO commitFromSimulation request was issued. This is the phase file's
    // central acceptance criterion: the Apply button is inert until
    // clicked.
    expect(commitRequests).toHaveLength(0);

    // Click. This is the only path that may fire the commit.
    await applyButton.click();

    // The button becomes a confirmation line on success.
    await expect(page.getByText(/Applied\./)).toBeVisible({
      timeout: 30_000,
    });

    // ── ASSERTION 2 ───────────────────────────────────────────────────
    // Exactly one commitFromSimulation request — the click, and only the
    // click. Not zero (which would mean the click didn't fire), not two
    // (which would mean something auto-retried or a re-render re-fired).
    await expect
      .poll(() => commitRequests.length, {
        message: "expected exactly one commitFromSimulation request after clicking Apply",
        timeout: 30_000,
      })
      .toBe(1);
  });
});
