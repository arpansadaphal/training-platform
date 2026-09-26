import { test, expect, type Page } from "@playwright/test";

/**
 * Phase 4's Builder E2E.
 *
 * Rewritten per the Q3 ruling at the Phase 4 kickoff: the shipped
 * HYPERTROPHY_CONFIG has all-null thresholds per ARCH-029–031, so
 * computeAssessment returns UNVALIDATED and there is no banded
 * Assessment to render. The phase file's original acceptance criterion
 * ("verify the Assessment screen surfaces it as Biggest Opportunity") was
 * unsatisfiable without fabricating thresholds, which the freeze forbids.
 *
 * The rewritten test asserts the honest state instead:
 *   - the Assessment panel shows "Assessment not yet available",
 *   - none of the VALIDATED-only sections (Strengths / Attention areas /
 *     Biggest Opportunity / Actions) render,
 *   - committing produces a real version, visible on the program page.
 *
 * The negative assertions are the substance of the Q3 test: without them,
 * a future regression that starts rendering bands on an unvalidated config
 * would still pass the "commit succeeds" path. Asserting absence of the
 * section headings — rather than absence of specific band strings — keeps
 * the test structural and independent of the provisional band names.
 *
 * No cleanup of the test user after the run. Phase 0's E2E leaves its
 * fixtures in place too; a test-data sweep belongs to a future phase, not
 * to a per-test afterEach in Phase 4.
 */

/**
 * Signs up a fresh user with a per-run unique email, so parallel runs and
 * repeated runs on the same DB don't collide on the email unique constraint.
 * Lands on /app (the signup action redirects there on success).
 */
async function signUpFreshUser(page: Page): Promise<string> {
  const email = `phase4-builder-${crypto.randomUUID()}@example.test`;
  const password = "correct-horse-battery-staple";

  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();

  // Signup redirects to /app on success. 30s rather than Playwright's 5s
  // default: the first POST to a Server Action in `next dev` triggers a
  // lazy compile that can exceed 5s in a monorepo, and this is the very
  // first Server Action call any given dev server handles. Production
  // builds have no such cost — this timeout is a dev-environment
  // accommodation, not a claim about production latency.
  await expect(page).toHaveURL(/\/app$/, { timeout: 30_000 });
  return email;
}

/**
 * Creates a Program via the existing form on /app/programs and returns the
 * absolute path of its detail page.
 *
 * Why the reload:
 *
 * createProgramAction calls revalidatePath("/app/programs") but does not
 * redirect. revalidatePath invalidates the server cache; it does not
 * reliably push a client re-render within the test's patience window in
 * `next dev`. Reloading is deterministic and tests the same observable
 * outcome: after create, the program exists and is listed. (A future
 * phase may change createProgramAction to redirect, which would make
 * this reload unnecessary — the product behavior, not the mechanism, is
 * what Phase 4 verifies.)
 */
async function createProgram(page: Page, name: string): Promise<string> {
  await page.goto("/app/programs");

  await page
    .getByPlaceholder("e.g. 4-day upper/lower")
    .fill(name);
  await page.getByRole("button", { name: "Create" }).click();

  // Wait for the Server Action POST to complete, then reload so the
  // fresh RSC payload — including the new program — is what the test
  // observes. Without this, the assertion races Next's revalidation.
  await page.waitForLoadState("networkidle");
  await page.reload();

  const programLink = page.getByRole("link", { name, exact: true });
  await expect(programLink).toBeVisible();

  const href = await programLink.getAttribute("href");
  if (!href) {
    throw new Error(
      `Program link "${name}" is visible but has no href attribute`,
    );
  }
  return href;
}

test("Builder: build a draft, see the unvalidated Assessment state, commit a version", async ({
  page,
}) => {
  // `next dev` compiles each route lazily on first request. This test
  // navigates through five routes (/signup → /app → /app/programs →
  // /app/programs/[id] → /app/programs/[id]/build → back), each of which
  // pays a first-compile cost in the 2-6s range on this machine. The
  // default 30s Playwright timeout is not enough for the full flow on a
  // cold dev server. 120s is generous enough to survive even a slow cold
  // start without being long enough to mask a genuine hang.
  //
  // A future phase can eliminate this class of slowness entirely by
  // changing the Playwright webServer.command from `pnpm dev` to
  // `pnpm build && pnpm start` — noted in PROJECT_STATE, not done here
  // because it makes every future E2E run pay a full build before
  // starting.
  test.setTimeout(120_000);

  const programName = `E2E Program ${Date.now()}`;
  await signUpFreshUser(page);

  const programHref = await createProgram(page, programName);
  await page.goto(programHref);
  await expect(page).toHaveURL(/\/app\/programs\/[^/]+$/);

  // ── Open the Builder from the program detail page ─────────────────────
  //
  // This page was loaded via a fresh page.goto (no pending RSC re-render),
  // so hydration is complete and the click is a legitimate test of the
  // product's navigation.
  await page.getByRole("link", { name: "Open Builder" }).click();
  await expect(page).toHaveURL(/\/app\/programs\/[^/]+\/build$/);

  // ── Create a draft ────────────────────────────────────────────────────
  await page.getByPlaceholder("Option B").fill("Option A");
  await page.getByRole("button", { name: "Create draft" }).click();

  // The draft's label becomes the editor heading.
  await expect(
    page.getByRole("heading", { name: /Option A/ }),
  ).toBeVisible();

  // ── Add a workout day and one exercise ────────────────────────────────
  await page.getByRole("button", { name: "+ Add workout day" }).click();

  // Exercise picker: choose the first real option (index 0 is the
  // "Choose an exercise…" placeholder).
  await page
    .getByLabel("Choose an exercise")
    .selectOption({ index: 1 });
  await page.getByRole("button", { name: "Add exercise" }).click();

  // ── Save, and wait for the assessment panel to reflect the saved draft ─
  await page.getByRole("button", { name: "Save", exact: true }).click();

  // ── The Q3 assertions ─────────────────────────────────────────────────
  const assessmentPanel = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Assessment" }),
  });

  await expect(
    assessmentPanel.getByRole("heading", {
      name: "Assessment not yet available",
    }),
  ).toBeVisible();

  // None of the VALIDATED-only sections render. Asserting their absence is
  // the structural equivalent of "no banded assessment was rendered" and
  // stays valid across provisional band-name revisions.
  for (const heading of [
    "Strengths",
    "Attention areas",
    "Biggest Opportunity",
    "Actions",
  ]) {
    await expect(
      assessmentPanel.getByRole("heading", { name: heading }),
    ).toHaveCount(0);
  }

  // ── Commit, and verify the version on the program page ────────────────
  await page.getByRole("button", { name: "Commit", exact: true }).click();

  // Commit success clears the selected draft and shows a confirmation.
  await expect(
    page.getByText(/Committed as version 1\./),
  ).toBeVisible();

  // Navigate back to the program detail page via the breadcrumb.
  await page
    .getByRole("link", { name: new RegExp(`← ${programName}`) })
    .click();
  await expect(page).toHaveURL(/\/app\/programs\/[^/]+$/);

  // The Versions section now lists version 1, marked active.
  const versionsSection = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Versions" }),
  });
  await expect(
    versionsSection.getByText("Version 1"),
  ).toBeVisible();
  await expect(versionsSection.getByText("(active)")).toBeVisible();
});