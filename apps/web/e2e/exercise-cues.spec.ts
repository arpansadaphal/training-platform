import { test, expect, type Page } from "@playwright/test";

/**
 * Exercise cues on the session screen: a "Cues" toggle (44px, aria-expanded, collapsed by default), a "(beta)"
 * label while the cues are unreviewed, and a 375px fold check that the log inputs have not moved off the first screen.
 *
 * Needs the seeded exercise library (prisma/seed.ts writes the cues).
 */

async function signUp(page: Page): Promise<void> {
  await page.goto("/signup");
  await page.getByLabel("Email").fill(`cues-${crypto.randomUUID()}@example.test`);
  await page.getByLabel("Password").fill("correct-horse-battery-staple");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/app$/, { timeout: 30_000 });
}

/** One day with one named exercise, committed. The Builder is desktop-sized; the session is then driven at 375px. */
async function commitProgram(page: Page, program: string, exercise: string): Promise<void> {
  await page.goto("/app/programs");
  await page.getByPlaceholder("e.g. 4-day upper/lower").fill(program);
  await page.getByRole("button", { name: "Create" }).click();
  await page.waitForLoadState("networkidle");
  await page.reload();
  await page.getByRole("link", { name: program, exact: true }).click();
  await page.getByRole("link", { name: "Open Builder" }).click();
  await page.getByLabel("New draft label").fill("Option A");
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page.getByRole("heading", { name: /Option A/ })).toBeVisible();
  await page.getByRole("button", { name: "+ Add workout day" }).click();
  const picker = page.getByLabel("Choose an exercise");
  const value = await picker.evaluate(
    (el, name) =>
      [...(el as HTMLSelectElement).options].find((o) => o.text.startsWith(name))?.value ?? null,
    exercise,
  );
  expect(value, `"${exercise}" is in the exercise picker`).not.toBeNull();
  await picker.selectOption(value!);
  await page.getByRole("button", { name: "Add exercise" }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Overall" })).toBeVisible();
  await page.getByRole("button", { name: "Commit", exact: true }).click();
  await expect(page.getByText(/Committed as version 1\./)).toBeVisible();
}

async function startSession(page: Page, program: string): Promise<void> {
  await page.goto("/train");
  await page.waitForLoadState("networkidle");
  const card = page.locator("li").filter({ hasText: program });
  // A click before the page hydrates does nothing on a cold dev server, so the click is retried.
  await expect(async () => {
    await card.getByRole("button", { name: /Start training|Continue training/ }).click();
    await expect(page).toHaveURL(/\/train\/session\/[^/]+$/, { timeout: 5_000 });
  }).toPass({ timeout: 45_000 });
  await page.getByRole("button", { name: "Start session" }).click();
  await expect(page.getByRole("button", { name: "Log one set" }).first()).toBeVisible();
}

/** Where the first card's log controls sit on a 375x812 screen, scrolled to the top. */
async function foldNumbers(page: Page) {
  await page.evaluate(() => window.scrollTo(0, 0));
  return page.evaluate(() => {
    const top = (el: Element | null) => (el ? Math.round(el.getBoundingClientRect().top) : null);
    const bottom = (el: Element | null) =>
      el ? Math.round(el.getBoundingClientRect().bottom) : null;
    const reps = document.querySelector<HTMLElement>('input[inputmode="numeric"]');
    const log =
      [...document.querySelectorAll("button")].find(
        (b) => b.textContent?.trim() === "Log one set",
      ) ?? null;
    return {
      viewportHeight: window.innerHeight,
      repsTop: top(reps),
      logButtonTop: top(log),
      logButtonBottom: bottom(log),
      scrollWidth: document.documentElement.scrollWidth,
    };
  });
}

test.describe("exercise cues (375px)", () => {
  test.setTimeout(150_000);

  test("fold: the log controls stay on the first screen", async ({ page }) => {
    const program = `Cues fold ${Date.now()}`;
    await signUp(page);
    await commitProgram(page, program, "Back Squat");
    await page.setViewportSize({ width: 375, height: 812 });
    await startSession(page, program);

    const collapsed = await foldNumbers(page);
    test
      .info()
      .annotations.push({ type: "fold-collapsed", description: JSON.stringify(collapsed) });
    console.log("FOLD collapsed", JSON.stringify(collapsed));
    // The Log button is fully inside the 812px first screen, and nothing runs sideways.
    expect(collapsed.logButtonBottom).toBeLessThanOrEqual(collapsed.viewportHeight);
    expect(collapsed.scrollWidth).toBeLessThanOrEqual(375);
  });

  test("Cues toggle: collapsed by default, 44px, aria-expanded, beta label, no horizontal scroll", async ({
    page,
  }) => {
    const program = `Cues toggle ${Date.now()}`;
    await signUp(page);
    await commitProgram(page, program, "Back Squat");
    await page.setViewportSize({ width: 375, height: 812 });
    await startSession(page, program);

    const toggle = page.getByRole("button", { name: /^Cues/ });
    await expect(toggle).toHaveCount(1);
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    // Unreviewed cues carry the beta label, in the toggle itself so it shows while collapsed.
    await expect(toggle).toContainText("(beta)");
    const box = (await toggle.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThanOrEqual(44);

    // Collapsed: no cue text on the page.
    const panelId = (await toggle.getAttribute("aria-controls"))!;
    expect(panelId).toBeTruthy();
    await expect(page.locator(`#${panelId}`)).toHaveCount(0);
    await expect(page.getByText("Sit down between your hips")).toHaveCount(0);

    // Open: the seeded Back Squat cues, as a list the toggle controls.
    const before = await foldNumbers(page);
    if (process.env.CUES_SHOTS)
      await page.screenshot({ path: `${process.env.CUES_SHOTS}/cues-collapsed-375.png` });
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    const panel = page.locator(`#${panelId}`);
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("listitem")).toHaveCount(3);
    await expect(panel).toContainText("Sit down between your hips");
    const open = await foldNumbers(page);
    console.log("FOLD open", JSON.stringify(open));
    if (process.env.CUES_SHOTS)
      await page.screenshot({ path: `${process.env.CUES_SHOTS}/cues-open-375.png` });
    expect(open.scrollWidth).toBeLessThanOrEqual(375);
    // The cues open above the log controls, so they move down by the panel's height and no more.
    expect(open.repsTop! - before.repsTop!).toBeGreaterThan(0);

    // Closing puts the log controls back exactly where they were.
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator(`#${panelId}`)).toHaveCount(0);
    expect(await foldNumbers(page)).toEqual(before);

    // Keyboard: the toggle is a real button.
    await toggle.focus();
    await page.keyboard.press("Enter");
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Space");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  test("logging a set still works with the cues open", async ({ page }) => {
    const program = `Cues log ${Date.now()}`;
    await signUp(page);
    await commitProgram(page, program, "Back Squat");
    await page.setViewportSize({ width: 375, height: 812 });
    await startSession(page, program);

    await page.getByRole("button", { name: /^Cues/ }).click();
    await page.getByLabel("Reps").first().fill("8");
    const log = page.getByRole("button", { name: "Log one set" }).first();
    await expect(log).toBeEnabled();
    await log.click();
    await expect(page.getByText(/Set 1: 8 reps/)).toBeVisible();
  });
});
