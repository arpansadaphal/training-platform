import { test, expect, type Page } from "@playwright/test";
import { chooseRpe, chooseWeight, openSheet, rpeButton, weightButton } from "./pickers";

/**
 * Phase A3c: the session screen.
 *   - Before "Start session": only the day, date and exercise names.
 *   - Weight and effort are chosen from sheets that open centered on the plan.
 *
 * Setup runs at desktop size (the Builder is not phone-ready); the session
 * itself is then exercised at 375px.
 */

async function signUp(page: Page): Promise<void> {
  await page.goto("/signup");
  await page.getByLabel("Email").fill(`a3c-${crypto.randomUUID()}@example.test`);
  await page.getByLabel("Password").fill("correct-horse-battery-staple");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/app$/, { timeout: 30_000 });
}

/** One day, one exercise, optionally with a planned weight in kg. Committed. */
async function commitProgram(
  page: Page,
  name: string,
  planned?: { weight: number; unit?: "kg" | "lb" },
): Promise<void> {
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
  // A new exercise starts with a fixed 20 kg plan; change it when asked.
  if (planned !== undefined) {
    if (planned.unit === "lb") {
      await page.getByRole("combobox").filter({ has: page.locator('option[value="lb"]') }).selectOption("lb");
    }
    await page.getByRole("spinbutton", { name: /Planned weight/ }).fill(String(planned.weight));
  }
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Overall" })).toBeVisible();
  await page.getByRole("button", { name: "Commit", exact: true }).click();
  await expect(page.getByText(/Committed as version 1\./)).toBeVisible();
}

async function openSession(page: Page, programName: string): Promise<void> {
  await page.goto("/train");
  const card = page.locator("li").filter({ hasText: programName });
  await card.getByRole("button", { name: /Start training|Continue training/ }).click();
  await expect(page).toHaveURL(/\/train\/session\/[^/]+$/);
}

/** Opt-in: A3A_SHOTS=<dir> saves a screenshot at the named moment. */
async function shot(page: Page, name: string): Promise<void> {
  if (process.env.A3A_SHOTS) await page.screenshot({ path: `${process.env.A3A_SHOTS}/${name}.png` });
}

async function noHorizontalScroll(page: Page): Promise<void> {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(over).toBeLessThanOrEqual(0);
}

test("session screen is gated until Start, then shows the pickers (375px)", async ({ page }) => {
  test.setTimeout(150_000);
  const program = `A3c UX ${Date.now()}`;
  await signUp(page);
  await commitProgram(page, program, { weight: 62.5 });
  await page.setViewportSize({ width: 375, height: 812 });
  await openSession(page, program);

  // ── Before Start: day, date, exercise names, one clear CTA ─────────────
  const start = page.getByRole("button", { name: "Start session" });
  await expect(start).toBeVisible();
  await expect(page.getByRole("heading", { name: new RegExp(program) })).toBeVisible();
  const names = page.getByRole("list", { name: "Exercises" }).getByRole("listitem");
  await expect(names).toHaveCount(1);
  // The CTA sits above the exercise list.
  const startBox = (await start.boundingBox())!;
  const listBox = (await names.first().boundingBox())!;
  expect(startBox.y).toBeLessThan(listBox.y);
  expect(startBox.height).toBeGreaterThanOrEqual(44);
  // Nothing to log yet.
  await expect(page.getByRole("button", { name: "Log one set" })).toHaveCount(0);
  await expect(page.getByLabel("Reps")).toHaveCount(0);
  await expect(weightButton(page)).toHaveCount(0);
  await expect(rpeButton(page)).toHaveCount(0);
  await expect(page.getByText("Post-session notes")).toHaveCount(0);
  await noHorizontalScroll(page);
  await shot(page, "1-before-start");

  // ── After Start: the full logging UI ───────────────────────────────────
  await start.click();
  await expect(page.getByRole("button", { name: "Mark complete" })).toBeVisible();
  await expect(page.getByLabel("Reps").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Log one set" }).first()).toBeVisible();
  await expect(page.getByText("Post-session notes")).toBeVisible();

  // Effort starts on the plan's target (the Builder's default is 2 RIR = RPE 8), and says so.
  await expect(rpeButton(page)).toContainText("Hard — 2-3 reps left (RPE 8)");
  // Weight starts empty: the list opens on the plan but chooses nothing.
  await expect(weightButton(page)).toContainText("Choose");

  await shot(page, "2-after-start");

  // ── Weight sheet: opens centered on the planned 62.5 kg ───────────────
  const sheet = await openSheet(page, weightButton(page));
  await shot(page, "3-weight-sheet");
  const geometry = await sheet.evaluate((el) => {
    const list = el.querySelector<HTMLElement>('[role="listbox"]')!;
    const centered = list.querySelector<HTMLElement>('[data-center="true"]')!;
    const lr = list.getBoundingClientRect();
    const cr = centered.getBoundingClientRect();
    return {
      value: centered.dataset.value,
      offsetFromMiddle: Math.abs(cr.top + cr.height / 2 - (lr.top + lr.height / 2)),
      visible: cr.top >= lr.top && cr.bottom <= lr.bottom,
      optionHeight: cr.height,
      sheetWidth: el.getBoundingClientRect().width,
    };
  });
  expect(geometry.value).toBe("62.5");
  expect(geometry.visible).toBe(true);
  expect(geometry.offsetFromMiddle).toBeLessThanOrEqual(geometry.optionHeight);
  expect(geometry.optionHeight).toBeGreaterThanOrEqual(44);
  expect(geometry.sheetWidth).toBeLessThanOrEqual(375);
  // Both units: the other one is shown beside each weight.
  await expect(sheet.locator('[data-value="100"]')).toContainText("220 lb");
  // Bodyweight is a fixed option; there is no "Same as last" before anything is logged.
  await expect(sheet.getByRole("button", { name: /^Bodyweight/ })).toBeVisible();
  await expect(sheet.getByRole("button", { name: /^Same as last/ })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();

  // ── Choose 60 kg and RPE 9, log; the stored numbers are plain ─────────
  await chooseWeight(page, "60");
  await expect(weightButton(page)).toContainText("60 kg");
  await chooseRpe(page, 9);
  await expect(rpeButton(page)).toContainText("Very hard — 1 rep left (RPE 9)");
  await page.getByLabel("Reps").first().fill("5");
  await page.getByRole("button", { name: "Log one set" }).first().click();
  await expect(page.getByText(/Set 1: 5 reps @ 60 kg @ RPE 9/)).toBeVisible();

  // ── "Same as last" now offers 60 kg ───────────────────────────────────
  const again = await openSheet(page, weightButton(page));
  await expect(again.getByRole("button", { name: /^Same as last/ })).toContainText("60 kg");
  await again.getByRole("button", { name: /^Bodyweight/ }).click();
  await expect(weightButton(page)).toContainText("Bodyweight");
  await page.getByRole("button", { name: "Log one set" }).first().click();
  await expect(page.getByText(/Set 2: 5 reps @ bodyweight @ RPE 9/)).toBeVisible();

  // ── "Don't record" clears the effort ──────────────────────────────────
  const rpeSheet = await openSheet(page, rpeButton(page));
  await shot(page, "4-rpe-sheet");
  await rpeSheet.getByRole("button", { name: "Don't record" }).click();
  await expect(rpeButton(page)).toContainText("Choose");

  // ── Phone fit while the page has pickers ──────────────────────────────
  await noHorizontalScroll(page);
  const small = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("a, button, input, select, textarea, summary")]
      .filter((el) => el.offsetParent !== null)
      .map((el) => ({ h: el.getBoundingClientRect().height, t: el.getAttribute("aria-label") ?? el.textContent?.trim().slice(0, 30) }))
      .filter((x) => x.h > 0 && x.h < 43.5),
  );
  expect(small).toEqual([]);
});

test("a pound plan lists 5 lb steps with kilograms beside, opening on the plan", async ({ page }) => {
  test.setTimeout(150_000);
  const program = `A3c lb ${Date.now()}`;
  await signUp(page);
  await commitProgram(page, program, { weight: 135, unit: "lb" });
  await openSession(page, program);
  await page.getByRole("button", { name: "Start session" }).click();
  const sheet = await openSheet(page, weightButton(page));
  await expect(sheet.locator('[data-center="true"]')).toHaveAttribute("data-value", "135");
  await expect(sheet.locator('[data-value="135"]')).toContainText("61.2 kg");
  await expect(sheet.locator('[data-value="140"]')).toBeVisible();
  await expect(sheet.locator('[data-value="137.5"]')).toHaveCount(0);
  await sheet.locator('[data-value="140"]').click();
  await expect(weightButton(page)).toContainText("140 lb");
});
