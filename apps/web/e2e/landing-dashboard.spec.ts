import { test, expect, type Page } from "@playwright/test";

/**
 * Phase 7's landing-dashboard E2E.
 *
 * Proves the acceptance criterion from the phase file: "a returning user
 * with an active program and a completed session lands on /app and sees
 * their current status as the primary content, not a feature grid."
 *
 * What the test asserts:
 *   - A brand-new user with no programs sees a genuine empty state
 *     ("Start your first program"), not a navigation grid.
 *   - After creating and committing a program, /app renders the program
 *     name as the primary heading, a lifetime-stats region, and a
 *     context-appropriate primary call to action.
 *   - After completing one session, the lifetime stats region is still
 *     present and the primary CTA still leads somewhere useful.
 *
 * What the test deliberately does NOT do:
 *   - It does not assert on stat numbers. The dashboard's exact counts are
 *     an API concern exercised by the Vitest suite; the E2E is about whether
 *     the surface renders as an identity/progress page rather than a
 *     feature list.
 *   - It does not verify the identity summary's per-field values — those
 *     are covered by the tRPC read at page render time.
 *
 * Test data: one user + one program per run, left in the dev DB by the
 * same policy as the other Phase 4/5/6 specs.
 */

async function signUpFreshUser(page: Page): Promise<string> {
  const email = `phase7-dashboard-${crypto.randomUUID()}@example.test`;
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
  await page.getByLabel("Choose an exercise").selectOption({ index: 1 });
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

test("Landing dashboard: primary program surfaces as the identity/progress content", async ({
  page,
}) => {
  // Six routes on a cold dev server: /signup → /app → /app/programs →
  // /app/programs/[id] → /app/programs/[id]/build → /app.
  test.setTimeout(240_000);

  const programName = `E2E Dashboard ${Date.now()}`;
  await signUpFreshUser(page);

  // ── New user sees an honest empty state, not a feature grid ───────────
  await expect(
    page.getByRole("heading", { name: /Start your first program/ }),
  ).toBeVisible();

  // ── Create + commit ──────────────────────────────────────────────────
  const programHref = await createProgram(page, programName);
  await commitV1(page, programHref);

  // ── Back to /app: program hero is the primary content ────────────────
  await page.goto("/app");
  await expect(page).toHaveURL(/\/app$/);

  // Identity greeting present.
  await expect(
    page.getByRole("heading", { name: /Hi,|Welcome back/ }),
  ).toBeVisible();

  // Program name is the primary heading — not "Dashboard", not a feature
  // card in a grid.
  await expect(
    page.getByRole("heading", { name: programName }),
  ).toBeVisible();

  // Lifetime-stats region present.
  await expect(
    page.getByRole("region", { name: "Lifetime stats" }),
  ).toBeVisible();
  await expect(page.getByText("Sessions completed")).toBeVisible();

  // A primary CTA is present, and it points at the training surface.
  // (Before any session exists, the CTA is "Start next session" — the
  // block was opened automatically by the commit, per ARCH-039.)
  await expect(
    page.getByRole("link", { name: "Start next session" }),
  ).toBeVisible();

  // ── Train one session to completion ──────────────────────────────────
  await page.getByRole("link", { name: "Start next session" }).click();
  await expect(page).toHaveURL(/\/train$/);

  const programCard = page.locator("li").filter({ hasText: programName });
  await programCard
    .getByRole("button", { name: "Start training" })
    .click();
  await expect(page).toHaveURL(/\/train\/session\/[^/]+$/);

  await page.getByRole("button", { name: "Start session" }).click();
  await expect(
    page.getByRole("button", { name: "Mark complete" }),
  ).toBeVisible();

  const repsInput = page.getByLabel("Reps").first();
  await repsInput.fill("8");
  await page.getByRole("button", { name: "Log one set" }).first().click();
  await expect(page.getByText(/Set logged\./)).toBeVisible();

  await page.getByRole("button", { name: "Mark complete" }).click();
  await expect(page.getByText(/Session completed\./)).toBeVisible();

  // ── Back to /app: the identity surface is intact, stats reflect the
  //    completed session ────────────────────────────────────────────────
  await page.goto("/app");
  await expect(
    page.getByRole("heading", { name: programName }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Lifetime stats" }),
  ).toBeVisible();

  // The block strip is present with a Review link — the entry point into
  // Phase 7's Review screen.
  await expect(
    page.getByRole("link", { name: "Review block" }),
  ).toBeVisible();
});