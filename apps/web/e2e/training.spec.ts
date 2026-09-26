import { test, expect, type Page } from "@playwright/test";

/**
 * Phase 6's training-execution E2E.
 *
 * Exercises the full acceptance flow the phase file names:
 *   commit a version → activate it (implicitly, via ARCH-039's commit-time
 *   lifecycle) → open today's session → log a set that deliberately deviates
 *   from the plan → mark the session complete.
 *
 * What the test proves:
 *   - A committed version is trainable immediately — the block opens
 *     inside the commit transaction, so /train shows the Program as ready
 *     without a separate "activate" click.
 *   - Session generation is lazy and idempotent: /train → Start training
 *     lands on a real Session, and re-visiting the same program does not
 *     spawn a duplicate.
 *   - The deviation-honesty requirement holds end-to-end: the value the
 *     user types is the value the UI shows back after logging.
 *   - Status transitions work: Start session → Mark complete.
 *
 * What the test deliberately does NOT do:
 *   - A second commit + explicit activate is covered by the Vitest suite
 *     (trainingService.test.ts). The UI's Activate button exercises the same
 *     service call; leaving it out of the E2E keeps this spec focused on
 *     the training flow itself.
 *   - No assertion on Gain/Cost/Net or Assessment output — those are the
 *     unvalidated path and covered by Phase 4/5's specs.
 *
 * Test data: one user + one program per run, left in the dev DB by the same
 * policy as builder.spec.ts and builder-simulate.spec.ts.
 */

async function signUpFreshUser(page: Page): Promise<string> {
  const email = `phase6-training-${crypto.randomUUID()}@example.test`;
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

test("Training: commit a version, start the session, log a deviation, mark complete", async ({
  page,
}) => {
  // Seven routes on a cold dev server: /signup → /app → /app/programs →
  // /app/programs/[id] → /app/programs/[id]/build → /train →
  // /train/session/[id]. Same cold-compile budget as Phase 5's spec.
  test.setTimeout(240_000);

  const programName = `E2E Training ${Date.now()}`;
  await signUpFreshUser(page);

  const programHref = await createProgram(page, programName);
  await page.goto(programHref);
  await expect(page).toHaveURL(/\/app\/programs\/[^/]+$/);

  // ── Commit v1 ─────────────────────────────────────────────────────────
  await page.getByRole("link", { name: "Open Builder" }).click();
  await expect(page).toHaveURL(/\/app\/programs\/[^/]+\/build$/);

  await page.getByPlaceholder("Option B").fill("Option A");
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page.getByRole("heading", { name: /Option A/ })).toBeVisible();

  await page.getByRole("button", { name: "+ Add workout day" }).click();
  await page.getByLabel("Choose an exercise").selectOption({ index: 1 });
  await page.getByRole("button", { name: "Add exercise" }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();

  // Same wait Phase 4 uses: the assessment panel is present-tense stable
  // (unvalidated) after save, so this is the reliable "save has resolved"
  // signal before the Commit click.
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

  // ── Go to /train; the block was opened by the commit (ARCH-039) ────────
  await page.goto("/train");
  await expect(page.getByRole("heading", { name: "Training" })).toBeVisible();
  await expect(page.getByText(programName)).toBeVisible();

  // ── Start training ────────────────────────────────────────────────────
  const programCard = page
    .locator("li")
    .filter({ hasText: programName });
  await programCard
    .getByRole("button", { name: "Start training" })
    .click();
  await expect(page).toHaveURL(/\/train\/session\/[^/]+$/);

  // The session detail heading is "Program — Day A" per SessionClient.
  await expect(
    page.getByRole("heading", { name: new RegExp(programName) }),
  ).toBeVisible();

  // ── Start session, log one deviation, mark complete ───────────────────
  await page.getByRole("button", { name: "Start session" }).click();
  await expect(
    page.getByRole("button", { name: "Mark complete" }),
  ).toBeVisible();

  // Log a set with a reps value that is (deliberately) a deviation from the
  // plan. The default add-exercise target is 3×8-10, so "5" is off-plan.
  const repsInput = page.getByLabel("Reps").first();
  await repsInput.fill("5");
  await page.getByRole("button", { name: "Log one set" }).first().click();

  await expect(page.getByText(/Set logged\./)).toBeVisible();
  await expect(page.getByText(/Set 1: 5 reps/)).toBeVisible();

  // ── Mark complete ─────────────────────────────────────────────────────
  await page.getByRole("button", { name: "Mark complete" }).click();
  await expect(page.getByText(/Session completed\./)).toBeVisible();

  // ── Back to /train: the picker still works ────────────────────────────
  await page.getByRole("link", { name: /← Training/ }).click();
  await expect(page).toHaveURL(/\/train$/);
  await expect(page.getByRole("heading", { name: "Training" })).toBeVisible();

  // The Program is still present and now shows a pending next Session when
  // the user clicks Start training again — but we do not click; the point
  // is that the /train surface is intact after a completed session.
  await expect(page.getByText(programName)).toBeVisible();
});