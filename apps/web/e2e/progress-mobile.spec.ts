import { test, expect, type Page } from "@playwright/test";

/**
 * Phase A3a: Progress view, progress verdict, post-workout summary, and the
 * phone layout, end to end.
 *
 * Setup runs at desktop size because the Builder is not yet usable on a phone
 * (deferred to A3c). Everything A3a built is then checked at 375px: no
 * horizontal scroll, every interactive element at least 44px, and the third
 * session is logged and completed at phone size.
 */

async function signUpFreshUser(page: Page): Promise<void> {
  await page.goto("/signup");
  await page.getByLabel("Email").fill(`a3a-${crypto.randomUUID()}@example.test`);
  await page.getByLabel("Password").fill("correct-horse-battery-staple");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/app$/, { timeout: 30_000 });
}

async function commitOneExerciseProgram(page: Page, name: string): Promise<void> {
  await page.goto("/app/programs");
  await page.getByPlaceholder("e.g. 4-day upper/lower").fill(name);
  await page.getByRole("button", { name: "Create" }).click();
  await page.waitForLoadState("networkidle");
  await page.reload();
  await page.getByRole("link", { name, exact: true }).click();
  await page.getByRole("link", { name: "Open Builder" }).click();
  await page.getByLabel("New draft label").fill("Option A");
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page.getByRole("heading", { name: /Option A/ })).toBeVisible();
  await page.getByRole("button", { name: "+ Add workout day" }).click();
  await page.getByLabel("Choose an exercise").selectOption({ index: 1 });
  await page.getByRole("button", { name: "Add exercise" }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Overall" })).toBeVisible();
  await page.getByRole("button", { name: "Commit", exact: true }).click();
  await expect(page.getByText(/Committed as version 1\./)).toBeVisible();
}

/** Start the next session, log one set at `weight` x 5, mark complete. Ends on the summary. */
async function trainOnce(page: Page, programName: string, weight: number): Promise<void> {
  await page.goto("/train");
  const card = page.locator("li").filter({ hasText: programName });
  await card.getByRole("button", { name: /Start training|Continue training/ }).click();
  await expect(page).toHaveURL(/\/train\/session\/[^/]+$/);
  await page.getByRole("button", { name: "Start session" }).click();
  await expect(page.getByRole("button", { name: "Mark complete" })).toBeVisible();
  await page.getByLabel(/Weight/).first().fill(String(weight));
  await page.getByLabel("Reps").first().fill("5");
  await page.getByRole("button", { name: "Log one set" }).first().click();
  await expect(page.getByText(/Set logged\./)).toBeVisible();
  await page.getByRole("button", { name: "Mark complete" }).click();
  const completeAnyway = page.getByRole("button", { name: "Complete anyway" });
  await completeAnyway
    .waitFor({ timeout: 2_000 })
    .then(() => completeAnyway.click(), () => undefined);
  await expect(page).toHaveURL(/\/train\/session\/[^/]+\/summary$/);
}

/** No horizontal scroll, and every visible interactive element is at least 44px. */
async function expectPhoneFit(page: Page, where: string): Promise<void> {
  await page.waitForLoadState("networkidle");
  // Opt-in: A3A_SHOTS=<dir> saves a full-page screenshot of every phone check.
  if (process.env.A3A_SHOTS) {
    await page.screenshot({
      path: `${process.env.A3A_SHOTS}/${where.replace(/[^a-z0-9]+/gi, "-")}.png`,
      fullPage: true,
    });
  }
  const report = await page.evaluate(() => {
    const vw = window.innerWidth;
    const small: string[] = [];
    const sel = "a, button, input, select, textarea, summary";
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(sel))) {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (r.width === 0 || r.height === 0 || cs.visibility === "hidden") continue;
      if (r.height < 43.5 || r.width < 43.5) {
        const label = (el.innerText || el.getAttribute("aria-label") || el.tagName).trim().slice(0, 30);
        small.push(`${el.tagName.toLowerCase()}[${label}] ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
    }
    return { vw, scrollWidth: document.documentElement.scrollWidth, small };
  });
  expect(report.scrollWidth, `${where}: horizontal scroll`).toBeLessThanOrEqual(report.vw);
  expect(report.small, `${where}: touch targets under 44px`).toEqual([]);
}

test("A3a: progress, verdict and summary, at 375px", async ({ page }) => {
  test.setTimeout(420_000);
  const programName = `E2E A3a ${Date.now()}`;

  await signUpFreshUser(page);

  // New user, nothing logged: the empty state.
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/app/progress");
  await expect(
    page.getByText("Log 2-3 sessions with a lift and we'll show your trend."),
  ).toBeVisible();
  await expectPhoneFit(page, "progress (empty)");

  // Two sessions at desktop size (the Builder is not phone-ready yet).
  await page.setViewportSize({ width: 1280, height: 720 });
  await commitOneExerciseProgram(page, programName);
  await trainOnce(page, programName, 100);

  // After one session: the exercise is listed, with an insufficient-data verdict.
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/app/progress");
  await expect(page.getByText("Log 2 more sessions for a verdict.")).toBeVisible();
  await expectPhoneFit(page, "progress (1 session)");

  await page.setViewportSize({ width: 1280, height: 720 });
  await trainOnce(page, programName, 105);

  // Third session at phone size, including the in-progress session screen.
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/train");
  await expectPhoneFit(page, "train");
  const card = page.locator("li").filter({ hasText: programName });
  await card.getByRole("button", { name: /Start training|Continue training/ }).click();
  await page.getByRole("button", { name: "Start session" }).click();
  await expect(page.getByRole("button", { name: "Mark complete" })).toBeVisible();
  await page.getByLabel(/Weight/).first().fill("110");
  await page.getByLabel("Reps").first().fill("5");
  await page.getByRole("button", { name: "Log one set" }).first().click();
  await expect(page.getByText(/Set logged\./)).toBeVisible();
  await expectPhoneFit(page, "session (in progress)");
  await page.getByRole("button", { name: "Edit set 1" }).click();
  await expectPhoneFit(page, "session (editing a set)");
  await page.getByRole("button", { name: "Cancel" }).click();

  await page.getByRole("button", { name: "Mark complete" }).click();
  const completeAnyway = page.getByRole("button", { name: "Complete anyway" });
  await completeAnyway
    .waitFor({ timeout: 2_000 })
    .then(() => completeAnyway.click(), () => undefined);

  // The summary: duration, sets, volume delta, a PR, a one-line verdict.
  await expect(page).toHaveURL(/\/train\/session\/[^/]+\/summary$/);
  await expect(page.getByText("Session complete", { exact: true })).toBeVisible();
  await expect(page.getByText("Duration")).toBeVisible();
  await expect(page.getByText("Sets logged")).toBeVisible();
  await expect(page.getByRole("heading", { name: "New PRs" })).toBeVisible();
  await expect(page.getByText(/Total volume up \d+% from last time\./)).toBeVisible();
  await expectPhoneFit(page, "summary");

  // Three sessions: a verdict, a chart, and an accordion that opens one at a time.
  await page.goto("/app/progress");
  await expect(page.getByText("Up 10% over your last 3 sessions.")).toBeVisible();
  const row = page.getByRole("button", { expanded: false }).first();
  await row.click();
  await expect(page.getByRole("img", { name: /top set weight/ })).toBeVisible();
  await expect(page.getByText(/Est\. 1RM/)).toBeVisible();
  await expect(page.getByText(/^PR \d/)).toBeVisible();
  await expectPhoneFit(page, "progress (expanded)");

  // Dashboard: "Where you stand", and the bottom tab bar at phone size.
  await page.goto("/app");
  await expect(page.getByRole("heading", { name: "Where you stand" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Progress", exact: true })).toBeVisible();
  await expectPhoneFit(page, "dashboard");
});
