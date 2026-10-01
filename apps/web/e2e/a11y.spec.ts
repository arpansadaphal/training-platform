// apps/web/e2e/a11y.spec.ts
//
// Phase 9 — automated accessibility scan of the Builder, Session logging,
// and Review screens (the three the phase file names). Bounded scope: not
// a full WCAG audit, but not skipped either.
//
// Runs axe-core via @axe-core/playwright. The assertion is on critical and
// serious violations only — a first-pass bound. A workspace with real
// content and custom components will typically surface minor/moderate
// findings that are cheap to log and expensive to fix in one pass; those
// are printed to the test output for triage but do not fail the test.
// Tightening to `toEqual([])` (all severities) is a Phase-10-or-later
// goal — noted in PROJECT_STATE.md's Phase 9 close-out.
//
// The three screens are visited in one test rather than three. Each visit
// requires signup → program → build → commit → navigate; that setup is
// ~90 seconds against a cold dev server. Paying it once and running three
// scans is materially faster than three independent tests, and there is
// no isolation benefit to forcing three setups — no test mutates state the
// others depend on.
//
// Runs under MODEL_PROVIDER=mock (or gemini on staging) — provider choice
// is irrelevant to accessibility. The Coach panel is NOT scanned here; it
// is rendered on the Review screen and its own accessibility pass is a
// Phase-10 candidate once the Coach UI is more settled.
//
// TIMEOUT: the per-test ceiling is 180 seconds. Before the CI webServer
// prod/dev fix (playwright.config.ts), this spec's original 600s ceiling
// was what tipped the CI job over its 30-minute budget when combined with
// Playwright's retries — a genuinely stuck test would burn 10 minutes,
// retry, and burn 10 more. 180s is plenty for a run that completes; the
// ceiling is a fail-fast guard, not a target.

import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// WCAG 2.0 A/AA and 2.1 A/AA. The project's stated accessibility bar is
// "basic pass, not full WCAG audit"; this tag set is the conventional
// baseline for that bar.
const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

// Severities that fail the test. Critical = user-blocking (keyboard trap,
// no accessible name on a control). Serious = substantial barrier (missing
// label, contrast below minimum on body text). Moderate/minor are logged.
const FAILING_IMPACTS = new Set(["critical", "serious"]);

async function runAxe(page: Page, label: string): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();

  const failing = results.violations.filter((v) =>
    FAILING_IMPACTS.has(v.impact ?? ""),
  );

  // Log every violation — including passing the moderate/minor ones through
  // to the test output so the human triage has them without a re-run.
  if (results.violations.length > 0) {
    console.log(
      `\n[a11y] ${label}: ${results.violations.length} violation(s) total, ` +
        `${failing.length} critical/serious`,
    );
    for (const v of results.violations) {
      console.log(`  - [${v.impact ?? "unknown"}] ${v.id}: ${v.help}`);
      for (const node of v.nodes.slice(0, 3)) {
        console.log(`      ${node.target.join(" ")}`);
      }
    }
  }

  expect(
    failing.map((v) => `${v.id} (${v.impact}): ${v.help}`),
    `Critical or serious accessibility violations on the ${label} screen`,
  ).toEqual([]);
}

// ── Setup helpers (minimal — just enough to reach each screen) ─────────

async function signUp(page: Page): Promise<void> {
  const email = `a11y-${crypto.randomUUID()}@example.test`;
  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct-horse-battery-staple");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/app$/, { timeout: 30_000 });
}

async function createProgramAndOpenBuilder(page: Page): Promise<void> {
  const name = `A11y ${Date.now()}`;
  await page.goto("/app/programs");
  await page.getByPlaceholder("e.g. 4-day upper/lower").fill(name);
  await page.getByRole("button", { name: "Create" }).click();
  await page.waitForLoadState("networkidle");
  await page.reload();

  const programLink = page.getByRole("link", { name, exact: true });
  await expect(programLink).toBeVisible();
  const href = await programLink.getAttribute("href");
  if (!href) throw new Error(`Program link "${name}" has no href`);

  await page.goto(href);
  await page.getByRole("link", { name: "Open Builder" }).click();
  await expect(page).toHaveURL(/\/app\/programs\/[^/]+\/build$/);
}

// ── The single continuous a11y walk ────────────────────────────────────

test.describe("Accessibility pass — Builder, Session logging, Review", () => {
  test("no critical or serious axe violations on the three named screens", async ({
    page,
  }) => {
    // 180s ceiling. See the file header for the reasoning; the CI
    // webServer fix makes this a fail-fast guard rather than a target.
    test.setTimeout(180_000);

    await signUp(page);
    await createProgramAndOpenBuilder(page);

    // ── 1. Builder ────────────────────────────────────────────────────
    // Scan the initial builder view. Adding a workout day here would put
    // the scan in a richer state, but the initial view is the state every
    // user sees on entry — it is the right baseline for a first-pass
    // accessibility check.
    await runAxe(page, "Builder");

    // Build a draft enough to commit — the Session and Review screens
    // require an active version.
    await page.getByPlaceholder("Option B").fill("A11y draft");
    await page.getByRole("button", { name: "Create draft" }).click();
    await expect(
      page.getByRole("heading", { name: /A11y draft/ }),
    ).toBeVisible();

    await page.getByRole("button", { name: "+ Add workout day" }).click();
    await page.getByLabel("Choose an exercise").selectOption({ index: 1 });
    await page.getByRole("button", { name: "Add exercise" }).click();
    await page.getByRole("button", { name: "Save", exact: true }).click();

    await page.getByRole("button", { name: "Commit", exact: true }).click();
    await expect(page.getByText(/Committed as version 1\./)).toBeVisible();

    // ── 2. Session logging ────────────────────────────────────────────
    // /train → "Start training" → /train/session/[id] → "Start session"
    // (transitions PLANNED → IN_PROGRESS, which is what puts the logging
    // UI in its interactive state).
    await page.goto("/app");
    const cta = page
      .getByRole("link", { name: /continue session|start (next )?session/i })
      .or(
        page.getByRole("button", {
          name: /continue session|start (next )?session/i,
        }),
      )
      .first();
    await expect(cta).toBeVisible({ timeout: 30_000 });
    await cta.click();
    await expect(page).toHaveURL(/\/train$/, { timeout: 30_000 });

    const startTraining = page.getByRole("button", {
      name: /^start training$/i,
    });
    await expect(startTraining).toBeVisible({ timeout: 15_000 });
    await startTraining.click();
    await expect(page).toHaveURL(/\/train\/session\/[^/]+$/, {
      timeout: 30_000,
    });

    const startSession = page.getByRole("button", {
      name: /^start session$/i,
    });
    await expect(startSession).toBeVisible({ timeout: 15_000 });
    await startSession.click();

    // Wait for the interactive logging UI ("Mark complete" only appears
    // once IN_PROGRESS).
    await expect(
      page.getByRole("button", { name: /^mark complete$/i }),
    ).toBeVisible({ timeout: 15_000 });

    await runAxe(page, "Session logging");

    // ── 3. Review ─────────────────────────────────────────────────────
    await page.goto("/app");
    const reviewLink = page.getByRole("link", {
      name: "Review block",
      exact: true,
    });
    await expect(reviewLink).toBeVisible({ timeout: 30_000 });
    const reviewHref = await reviewLink.getAttribute("href");
    if (!reviewHref || !reviewHref.startsWith("/app/review/")) {
      throw new Error(
        `Review block link has unexpected href: ${reviewHref ?? "(null)"}`,
      );
    }
    await page.goto(reviewHref);
    await expect(page).toHaveURL(/\/app\/review\/[^/]+$/);

    await runAxe(page, "Review");
  });
});