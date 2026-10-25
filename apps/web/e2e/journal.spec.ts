import { test, expect, type Page } from "@playwright/test";
import { chooseWeight } from "./pickers";

/**
 * Project 4, "your training record", end to end: the journal, first vs now on
 * Progress, a note that comes back at the next session of the same day, and
 * the CSV export, with the journal checked at 375px (no horizontal scroll,
 * every target 44px).
 *
 * Setup runs at desktop size because the Builder is not phone-ready.
 */

const NOTE = "Left knee felt off today";

async function signUpFreshUser(page: Page): Promise<void> {
  await page.goto("/signup");
  await page.getByLabel("Email").fill(`journal-${crypto.randomUUID()}@example.test`);
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

async function openNextSession(page: Page, programName: string): Promise<void> {
  await page.goto("/train");
  const card = page.locator("li").filter({ hasText: programName });
  await card.getByRole("button", { name: /Start training|Continue training/ }).click();
  await expect(page).toHaveURL(/\/train\/session\/[^/]+$/);
}

/** Starts the next session, logs one set at `weight` x 5, optionally saves a note, completes. Ends on the summary. */
async function trainOnce(page: Page, programName: string, weight: number, note?: string): Promise<void> {
  await openNextSession(page, programName);
  await page.getByRole("button", { name: "Start session" }).click();
  await expect(page.getByRole("button", { name: "Mark complete" })).toBeVisible();
  await chooseWeight(page, String(weight));
  await page.getByLabel("Reps").first().fill("5");
  await page.getByRole("button", { name: "Log one set" }).first().click();
  await expect(page.getByText(/Set 1: 5 reps/)).toBeVisible();
  await expect(page.getByText("Saving…", { exact: true })).toHaveCount(0);
  if (note !== undefined) {
    await page.getByPlaceholder("How did it go?").fill(note);
    await page.getByRole("button", { name: "Save note" }).click();
    await expect(page.getByText("Note saved.")).toBeVisible();
  }
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
  const report = await page.evaluate(() => {
    const vw = window.innerWidth;
    const small: string[] = [];
    for (const el of Array.from(
      document.querySelectorAll<HTMLElement>("a, button, input, select, textarea, summary"),
    )) {
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

test("Project 4: journal, first vs now, a note that comes back, and the export", async ({ page }) => {
  test.setTimeout(420_000);
  const programName = `E2E record ${Date.now()}`;

  await signUpFreshUser(page);

  // Nothing logged: the empty state, and the export link, at phone size.
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/app/journal");
  await expect(page.getByRole("heading", { name: "Journal" })).toBeVisible();
  await expect(page.getByText("Log your first session and it appears here.")).toBeVisible();
  await expect(page.getByText("Everything you log is yours. Download anytime.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Download my data" })).toBeVisible();
  await expectPhoneFit(page, "journal (empty)");

  // Session 1, with a note.
  await page.setViewportSize({ width: 1280, height: 720 });
  await commitOneExerciseProgram(page, programName);
  await trainOnce(page, programName, 100, NOTE);
  // An ordinary session has no milestone line.
  await expect(page.locator("[data-milestone]")).toHaveCount(0);

  // First vs now with one session: a baseline.
  await page.goto("/app/progress");
  await page.getByRole("button", { expanded: false }).first().click();
  await expect(page.locator("[data-first-vs-now]")).toHaveText(
    "Your first session on this lift. Baseline set.",
  );

  // Session 2: the note from session 1 is there before Start and after it, above the exercises.
  await openNextSession(page, programName);
  const recalled = page.getByRole("region", { name: "Your note from last time" });
  await expect(recalled).toBeVisible();
  await expect(recalled).toContainText(/^Your note from last .+ \([A-Z][a-z]{2} \d{1,2}\):/);
  await expect(recalled.getByText(NOTE, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Start session" }).click();
  await expect(page.getByRole("button", { name: "Mark complete" })).toBeVisible();
  await expect(recalled).toBeVisible();
  await expect(recalled.getByText(NOTE, { exact: true })).toBeVisible();
  await chooseWeight(page, "105");
  await page.getByLabel("Reps").first().fill("5");
  await page.getByRole("button", { name: "Log one set" }).first().click();
  await expect(page.getByText(/Set 1: 5 reps/)).toBeVisible();
  await expect(page.getByText("Saving…", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Mark complete" }).click();
  const completeAnyway = page.getByRole("button", { name: "Complete anyway" });
  await completeAnyway
    .waitFor({ timeout: 2_000 })
    .then(() => completeAnyway.click(), () => undefined);
  await expect(page).toHaveURL(/\/train\/session\/[^/]+\/summary$/);

  // First vs now with two sessions: both ends, no change in weight yet.
  await page.goto("/app/progress");
  await page.getByRole("button", { expanded: false }).first().click();
  const line = page.locator("[data-first-vs-now]");
  await expect(line).toContainText("Your first: 100 kg × 5");
  await expect(line).toContainText("Now: 105 kg × 5");
  await expect(line).not.toContainText("Up ");

  // The journal at phone size: newest first, with day, set, PR in words, and the note.
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/app/journal");
  const entries = page.locator("[data-journal-entry]");
  await expect(entries).toHaveCount(2);
  await expect(entries.first()).toContainText("Today");
  await expect(entries.first()).toContainText("× 5");
  await expect(entries.first()).toContainText("105 kg × 5");
  await expect(entries.first()).toContainText(/New PR on /);
  await expect(entries.nth(1)).toContainText("100 kg × 5");
  await expect(entries.nth(1)).toContainText(NOTE);
  await expect(entries.nth(1)).not.toContainText("New PR");
  await expect(page.getByRole("button", { name: "Load older" })).toHaveCount(0);
  await expectPhoneFit(page, "journal");

  // The export: one CSV, named for the day, with every logged set and the note.
  const response = await page.request.get("/app/journal/export");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("text/csv");
  expect(response.headers()["content-disposition"]).toMatch(
    /attachment; filename="your-training-data-\d{4}-\d{2}-\d{2}\.csv"/,
  );
  const csv = (await response.text()).replace(/^\uFEFF/, "");
  const lines = csv.trimEnd().split("\r\n");
  expect(lines[0]).toBe(
    "session_date,day,exercise,set_number,reps,weight,unit,rpe,completed_at,session_note",
  );
  expect(lines).toHaveLength(3);
  expect(lines[1]).toContain(`,1,5,100,kg,`);
  expect(lines[1]).toContain(NOTE);
  expect(lines[2]).toContain(`,1,5,105,kg,`);
});
