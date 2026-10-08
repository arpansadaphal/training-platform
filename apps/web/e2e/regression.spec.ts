// apps/web/e2e/regression.spec.ts
//
// Phase 9 — the full MVP regression, one continuous flow.
//
//   signup → create Program → build draft → commit v1 → train a session
//   with a deliberate deviation → mark complete → open Review → see the
//   COMMIT snapshot + provisional banner → click "recompute with current
//   thresholds" → open the Coach on the Review page → simulate → apply →
//   confirm v2 committed and active.
//
// This spec does NOT replace the per-phase specs (builder.spec.ts,
// builder-simulate.spec.ts, training.spec.ts, landing-dashboard.spec.ts,
// review.spec.ts, coach.spec.ts); it verifies they hold together end to end.
//
// PROVIDER: runs under MODEL_PROVIDER=mock with MOCK_SCENARIO=coach-regression
// in CI (see .github/workflows/ci.yml). The Coach step relies on the
// MockProvider scenario to produce a simulate → prepare_apply sequence.
// Runs under MODEL_PROVIDER=gemini against a real key on staging.
//
// CLEANUP: this spec does NOT clean up after itself. An earlier draft had a
// test.afterAll that deleted the test user via a direct Prisma call, but
// `@training/db` is resolved as CommonJS by Playwright's worker runtime and
// the named `prisma` export is not visible (Node ESM/CJS interop). Cleanup
// joins the older per-phase specs as a Phase-10-or-later candidate. See
// PROJECT_STATE.md's Phase 9 close-out.
//
// TRAINING STEP: per the Phase 9 ruling, selectors are HARD ASSERTIONS — no
// isVisible().catch(() => false) guards. The flow is two-step:
//
//   /train            → "Start training" (server action → Session detail)
//   /train/session/id → "Start session"  (client mutation, PLANNED→IN_PROGRESS)
//                     → fill reps, "Log one set"
//                     → "Mark complete"  (client mutation, IN_PROGRESS→COMPLETED)
//
// "Mark complete" is only rendered once the Session is IN_PROGRESS — the
// service's state machine rejects PLANNED → COMPLETED (sessionService's
// ALLOWED_TRANSITIONS).
//
// TIMEOUT: the per-test ceiling is 300 seconds. This is a single continuous
// flow through six routes plus a Coach turn; a genuinely stuck step has its
// own internal timeout, and this outer ceiling exists only to keep a hang
// from eating the whole CI budget. The webServer prod/dev fix in
// playwright.config.ts is what actually makes this spec complete quickly in
// CI; the outer ceiling is a fail-fast guard.

import { test, expect, type Page } from "@playwright/test";

// ── Step helpers ───────────────────────────────────────────────────────

async function signUp(page: Page): Promise<string> {
  const email = `regression-${crypto.randomUUID()}@example.test`;
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
    throw new Error(`Program link "${name}" has no href`);
  }
  return href;
}

async function buildAndCommitV1(page: Page, programHref: string): Promise<void> {
  await page.goto(programHref);

  await page.getByRole("link", { name: "Open Builder" }).click();
  await expect(page).toHaveURL(/\/app\/programs\/[^/]+\/build$/);

  await page.getByPlaceholder("Option B").fill("Regression draft");
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page.getByRole("heading", { name: /Regression draft/ })).toBeVisible();

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
}

async function trainOneSession(page: Page): Promise<void> {
  await page.goto("/app");

  const cta = page
    .getByRole("link", {
      name: /continue session|start (next )?session/i,
    })
    .or(
      page.getByRole("button", {
        name: /continue session|start (next )?session/i,
      }),
    )
    .first();
  await expect(cta).toBeVisible({ timeout: 30_000 });
  await cta.click();
  await expect(page).toHaveURL(/\/train$/, { timeout: 30_000 });

  const startTrainingButton = page.getByRole("button", {
    name: /^start training$/i,
  });
  await expect(startTrainingButton).toBeVisible({ timeout: 15_000 });
  await startTrainingButton.click();

  await expect(page).toHaveURL(/\/train\/session\/[^/]+$/, {
    timeout: 30_000,
  });

  const startSessionButton = page.getByRole("button", {
    name: /^start session$/i,
  });
  await expect(startSessionButton).toBeVisible({ timeout: 15_000 });
  await startSessionButton.click();

  const completeButton = page.getByRole("button", {
    name: /^mark complete$/i,
  });
  await expect(completeButton).toBeVisible({ timeout: 15_000 });

  const repsInput = page.getByLabel(/^reps$/i).first();
  await expect(repsInput).toBeVisible({ timeout: 15_000 });
  await repsInput.fill("3");

  const logButton = page.getByRole("button", { name: /^log one set$/i });
  await expect(logButton).toBeVisible({ timeout: 15_000 });
  await logButton.click();

  await expect(page.getByText(/set logged/i)).toBeVisible({
    timeout: 15_000,
  });

  await completeButton.click();

  await expect(page.getByText(/this session is complete/i)).toBeVisible({ timeout: 15_000 });
}

async function openReviewAndRecompute(page: Page): Promise<void> {
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
  await page.goto(reviewHref);
  await expect(page).toHaveURL(/\/app\/review\/[^/]+$/);

  await expect(
    page.getByRole("note", {
      name: /provisional thresholds disclaimer/i,
    }),
  ).toBeVisible();
  await expect(page.getByText(/not yet scientifically validated/i)).toBeVisible();

  await expect(page.getByRole("heading", { name: /assessment at commit time/i })).toBeVisible();

  const recomputeButton = page.getByRole("button", {
    name: /show recompute/i,
  });
  await expect(recomputeButton).toBeVisible();
  await recomputeButton.click();

  await expect(page.getByText(/live recompute using current thresholds/i)).toBeVisible({
    timeout: 30_000,
  });
}

async function simulateAndApplyViaCoach(page: Page): Promise<void> {
  const textarea = page.getByPlaceholder("Ask the Coach…");
  await expect(textarea).toBeVisible();
  await textarea.fill("Please simulate adding a new day, then offer me the button to apply it.");
  await page.getByRole("button", { name: /^Send$/ }).click();

  const applyButton = page.getByRole("button", {
    name: /apply this change/i,
  });
  await expect(applyButton).toBeVisible({ timeout: 90_000 });

  await applyButton.click();

  await expect(page.getByText(/Applied\./)).toBeVisible({
    timeout: 30_000,
  });
}

// ── The single continuous regression ──────────────────────────────────

test.describe("Full MVP regression", () => {
  test("walks the complete loop in one run", async ({ page }) => {
    // 300s ceiling. See the file header. All internal steps have their own
    // timeouts; this outer one is a hang guard, not a target.
    test.setTimeout(300_000);

    const programName = `Regression ${Date.now()}`;

    await signUp(page);
    const programHref = await createProgram(page, programName);
    await buildAndCommitV1(page, programHref);
    await trainOneSession(page);
    await openReviewAndRecompute(page);
    await simulateAndApplyViaCoach(page);

    await page.goto(programHref);
    await expect(page.getByText(/version 2/i).first()).toBeVisible({
      timeout: 30_000,
    });
  });
});
