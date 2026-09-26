import { test, expect, type Page } from "@playwright/test";

/**
 * Phase 5's simulate/apply E2E.
 *
 * The shipped HYPERTROPHY_CONFIG is unvalidated (ARCH-029/031), so a valid
 * simulation always lands on the CANNOT_COMPUTE branch of SimulationResult.
 * The test asserts that honest state — NOT a fabricated Gain/Cost/Net — then
 * applies the change through commitFromSimulation and verifies a new version
 * appears on the program page.
 *
 * The negative assertions (no "Gain" / "Cost" / "Net" heading rendered
 * before Apply) are the structural equivalent of "no fabricated diff was
 * shown". They stay valid across provisional band-name revisions.
 *
 * Reuses the signup + program-creation helpers from builder.spec.ts by
 * duplication rather than extraction — Phase 4 chose the same pattern and
 * extracting a shared helper is a future concern, not a Phase 5 one.
 *
 * No cleanup after the run. Same policy as builder.spec.ts.
 */

async function signUpFreshUser(page: Page): Promise<string> {
  const email = `phase5-simulate-${crypto.randomUUID()}@example.test`;
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

test("Simulate: propose one change, see the honest cannot-compute state, apply it", async ({
  page,
}) => {
  // Same cold-compile accommodation as the Phase 4 Builder E2E.
  test.setTimeout(180_000);

  const programName = `E2E Simulate ${Date.now()}`;
  await signUpFreshUser(page);

  const programHref = await createProgram(page, programName);
  await page.goto(programHref);
  await expect(page).toHaveURL(/\/app\/programs\/[^/]+$/);

  // ── Open Builder, create draft, add a day + exercise, commit ───────────
  await page.getByRole("link", { name: "Open Builder" }).click();
  await expect(page).toHaveURL(/\/app\/programs\/[^/]+\/build$/);

  await page.getByPlaceholder("Option B").fill("Option A");
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page.getByRole("heading", { name: /Option A/ })).toBeVisible();

  await page.getByRole("button", { name: "+ Add workout day" }).click();
  await page.getByLabel("Choose an exercise").selectOption({ index: 1 });
  await page.getByRole("button", { name: "Add exercise" }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();

  await page.getByRole("button", { name: "Commit", exact: true }).click();
  await expect(page.getByText(/Committed as version 1\./)).toBeVisible();

  // ── The simulate panel is now live (router.refresh() re-loaded the RSC) ─
  //
  // Wait for the panel's picker to become populated. The panel renders a
  // "Commit a version first" hint until activeVersionStructure is non-null;
  // after the refresh it renders the op selector.
  await expect(
    page.getByRole("heading", { name: "Try a specific change" }),
  ).toBeVisible();
  await expect(page.getByLabel("Operation")).toBeVisible();

  // ── Build and run a MODIFY_EXERCISE_PRESCRIPTION simulation ────────────
  await page.getByLabel("Operation").selectOption(
    "MODIFY_EXERCISE_PRESCRIPTION",
  );
 // Anchored regex, not a plain string: the Operation selector's option list
// ("…on an exercise", "…to a workout day", "Remove a workout day") bleeds
// into its accessible name, which makes the unanchored `getByLabel("Workout
// day")` collide with this selector under Playwright's strict mode. The `^`
// pins the match to the target label. Same reasoning for Prescription —
// anchored for symmetry and to survive future option-text additions.
// Durable fix (distinct label text per field) is a polish item, not this
// closing batch.
await page
  .getByRole("combobox", { name: /^Workout day/ })
  .selectOption({ index: 1 });
await page
  .getByRole("combobox", { name: /^Prescription/ })
  .selectOption({ index: 1 });
  // Role-anchored, same reason as the two combobox selectors above: the
// Operation select's accessible name includes every option's text, so
// "Change target sets on an exercise" bleeds into an unanchored
// getByLabel("Target sets") and collides with this input. Pinning to the
// spinbutton role matches only the intended element.
await page.getByRole("spinbutton", { name: /^Target sets/ }).fill("5");
  await page.getByRole("button", { name: "Simulate", exact: true }).click();

  // ── The honest CANNOT_COMPUTE state ────────────────────────────────────
  //
  // The shipped config is unvalidated, so the engine refuses to classify the
  // change. Assert the honest state; assert no Gain/Cost/Net headings
  // appeared (the negative check that would fail if the panel ever started
  // fabricating a computed diff against an unvalidated config).
  await expect(
    page.getByText(/Cannot compute Gain \/ Cost \/ Net/),
  ).toBeVisible();

  for (const heading of ["Gain", "Cost"]) {
    await expect(
      page.getByRole("heading", { name: heading, exact: true }),
    ).toHaveCount(0);
  }

  // ── Apply ──────────────────────────────────────────────────────────────
  await page
    .getByRole("button", { name: "Apply this change", exact: true })
    .click();
  await expect(page.getByText(/Applied as version 2\./)).toBeVisible();

  // ── Verify the new version on the program page ─────────────────────────
  await page
    .getByRole("link", { name: new RegExp(`← ${programName}`) })
    .click();
  await expect(page).toHaveURL(/\/app\/programs\/[^/]+$/);

  const versionsSection = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Versions" }),
  });
  await expect(versionsSection.getByText("Version 2")).toBeVisible();
});