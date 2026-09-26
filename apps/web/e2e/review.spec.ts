import { test, expect, type Page } from "@playwright/test";

/**
 * Phase 7's Review E2E.
 *
 * Two tests, one for each state the phase file names:
 *
 *   Test 1 — ACTIVE block (`isPartial: true`): a block that is still
 *   training shows a "still in progress" banner and whatever data exists
 *   so far, without error. This proves the "no separate end-block action
 *   required" design (08-training-execution-and-evidence.md) works for a
 *   genuinely-in-progress block.
 *
 *   Test 2 — closed block (`isPartial: false`): after committing a second
 *   version (which closes the first block per ARCH-039), the original
 *   block's Review is reachable at its original URL and no longer shows
 *   the partial banner. The COMMIT-time AssessmentSnapshot is what renders
 *   — never a live recompute (ARCH-015).
 *
 * What the tests deliberately do NOT do:
 *   - They do not assert on adherence numbers or deviation counts. Those
 *     are exercised by the API-layer aggregation; the E2E is about whether
 *     the screen renders in the right state.
 *   - They do not click "Show recompute". The opt-in path is exercised by
 *     the Vitest suite's `recomputeAssessment` service coverage. Adding it
 *     to the E2E would couple the spec to the unvalidated config's exact
 *     output.
 *
 * Test data: one user + one program per test, left in the dev DB by the
 * same policy as the other Phase 4/5/6/7 specs.
 *
 * Locator note: `getByLabel("Choose an exercise")` needs `{ exact: true }`
 * once a version is committed, because the Builder page then also renders
 * the SimulateChangePanel, whose prescription <select> has an accessible
 * name that substring-matches. Anchoring with exact: true picks only the
 * workout-day Builder select.
 */

async function signUpFreshUser(page: Page): Promise<string> {
  const email = `phase7-review-${crypto.randomUUID()}@example.test`;
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

async function commitV1(page: Page, programHref: string): Promise<void> {
  await page.goto(programHref);
  await page.getByRole("link", { name: "Open Builder" }).click();
  await expect(page).toHaveURL(/\/app\/programs\/[^/]+\/build$/);

  await page.getByPlaceholder("Option B").fill("Option A");
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page.getByRole("heading", { name: /Option A/ })).toBeVisible();

  await page.getByRole("button", { name: "+ Add workout day" }).click();
  await page
    .getByLabel("Choose an exercise", { exact: true })
    .selectOption({ index: 1 });
  await page.getByRole("button", { name: "Add exercise" }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();

  const assessmentPanel = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Assessment" }),
  });
  await expect(
    assessmentPanel.getByRole("heading", {
      name: "Assessment not yet available",
    }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Commit", exact: true }).click();
  await expect(page.getByText(/Committed as version 1\./)).toBeVisible();
}

async function commitV2(page: Page, programHref: string): Promise<void> {
  // Same shape as commitV1, but starting from an already-committed program
  // so the draft's baseVersionId points at v1. Committing v2 closes v1's
  // TrainingBlock (ARCH-039) and opens a new one against v2.
  await page.goto(programHref);
  await page.getByRole("link", { name: "Open Builder" }).click();
  await expect(page).toHaveURL(/\/app\/programs\/[^/]+\/build$/);

  await page.getByPlaceholder("Option B").fill("Option A v2");
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(
    page.getByRole("heading", { name: /Option A v2/ }),
  ).toBeVisible();

  await page.getByRole("button", { name: "+ Add workout day" }).click();
  // Anchored: once v1 exists, SimulateChangePanel's <select> is also on the
  // page and substring-matches the same label.
  await page
    .getByLabel("Choose an exercise", { exact: true })
    .selectOption({ index: 1 });
  await page.getByRole("button", { name: "Add exercise" }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();

  const assessmentPanel = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Assessment" }),
  });
  await expect(
    assessmentPanel.getByRole("heading", {
      name: "Assessment not yet available",
    }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Commit", exact: true }).click();
  await expect(page.getByText(/Committed as version 2\./)).toBeVisible();
}

/**
 * Captures the current TrainingBlock's id by reading the "Review block"
 * link's href off the /app dashboard. Assumes the caller has just
 * committed and is looking at /app with an active block.
 */
async function captureActiveBlockId(page: Page): Promise<string> {
  await page.goto("/app");
  const reviewLink = page.getByRole("link", { name: "Review block" });
  await expect(reviewLink).toBeVisible();
  const href = await reviewLink.getAttribute("href");
  if (!href) throw new Error("Review block link has no href");
  const match = /\/app\/review\/([^/]+)$/.exec(href);
  if (!match || !match[1]) {
    throw new Error(`Unexpected Review block href: ${href}`);
  }
  return match[1];
}

test("Review of an ACTIVE block shows the partial banner and the commit-time assessment", async ({
  page,
}) => {
  // Six routes on a cold dev server.
  test.setTimeout(240_000);

  const programName = `E2E Review Active ${Date.now()}`;
  await signUpFreshUser(page);
  const programHref = await createProgram(page, programName);
  await commitV1(page, programHref);

  const blockId = await captureActiveBlockId(page);
  await page.goto(`/app/review/${blockId}`);
  await expect(page).toHaveURL(new RegExp(`/app/review/${blockId}$`));

  // Partial banner is present — the block is still ACTIVE.
  await expect(
    page.getByText(/This block is still in progress/),
  ).toBeVisible();

  // The default view is the commit-time snapshot, not a live recompute.
  await expect(
    page.getByRole("heading", { name: "Assessment at commit time" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      /What you saw when you started this block\. Not recomputed\./,
    ),
  ).toBeVisible();

  // The opt-in recompute is present but collapsed — the phase file
  // requires it be available, not that it render by default.
  await expect(
    page.getByRole("button", { name: "Show recompute" }),
  ).toBeVisible();
});

test("Review of a closed block omits the partial banner", async ({ page }) => {
  test.setTimeout(300_000); // commitV2 adds two more routes.

  const programName = `E2E Review Closed ${Date.now()}`;
  await signUpFreshUser(page);
  const programHref = await createProgram(page, programName);
  await commitV1(page, programHref);

  // Capture v1's block id before committing v2 — after the second commit
  // the dashboard only surfaces v2's block, so we must save the URL now.
  const v1BlockId = await captureActiveBlockId(page);

  // Commit v2 — closes v1's block, opens v2's.
  await commitV2(page, programHref);

  // Visit v1's block Review directly (the URL still resolves; ownership is
  // on the TrainingBlock's userId).
  await page.goto(`/app/review/${v1BlockId}`);
  await expect(page).toHaveURL(new RegExp(`/app/review/${v1BlockId}$`));

  // No partial banner — v1's block is now closed.
  await expect(
    page.getByText(/This block is still in progress/),
  ).not.toBeVisible();

  // The commit-time assessment is still rendered.
  await expect(
    page.getByRole("heading", { name: "Assessment at commit time" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      /What you saw when you started this block\. Not recomputed\./,
    ),
  ).toBeVisible();
});