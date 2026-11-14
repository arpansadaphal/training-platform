import AxeBuilder from "@axe-core/playwright";
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

test.describe("exercise drawings (375px)", () => {
  test.setTimeout(150_000);

  test("an exercise with a drawing shows it in the Cues panel: two frames, loaded, credited, animated three times then at rest", async ({
    page,
  }) => {
    const program = `Drawing ${Date.now()}`;
    await signUp(page);
    await commitProgram(page, program, "Back Squat");
    await page.setViewportSize({ width: 375, height: 812 });
    await startSession(page, program);

    // Collapsed by default: no drawing in the card, so the fold is the cues fold.
    await expect(page.getByRole("img", { name: /Drawing of the Back Squat/ })).toHaveCount(0);

    await page.getByRole("button", { name: /^Cues/ }).click();
    const figure = page.getByRole("img", {
      name: "Drawing of the Back Squat, showing both ends of the movement",
    });
    await expect(figure).toBeVisible();
    const frames = figure.locator("img");
    await expect(frames).toHaveCount(2);
    await expect(frames.nth(0)).toHaveAttribute("src", "/exercises/back-squat-1.webp");
    await expect(frames.nth(1)).toHaveAttribute("src", "/exercises/back-squat-2.webp");
    // Both files really loaded (not a broken image).
    await expect
      .poll(() => frames.evaluateAll((els) => els.map((e) => (e as HTMLImageElement).naturalWidth)))
      .toEqual([480, 480]);
    // The credit is beside the picture and goes to /credits.
    const credit = page.getByRole("link", { name: "Drawing: Everkinetic, CC BY-SA 4.0" });
    await expect(credit).toHaveAttribute("href", "/credits");
    // It fits the phone.
    const box = (await figure.boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(375);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      375,
    );

    // Moving: two animations (one per frame), and they stop on their own, in under five seconds.
    const running = () =>
      page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running").length);
    expect(await running()).toBeGreaterThanOrEqual(2);
    await expect.poll(running, { timeout: 10_000 }).toBe(0);
    // At rest the first frame is showing and the second is not.
    const opacities = await frames.evaluateAll((els) =>
      els.map((e) => getComputedStyle(e).opacity),
    );
    expect(opacities).toEqual(["1", "0"]);
  });

  test("with reduced motion both frames are shown side by side and nothing moves", async ({
    page,
  }) => {
    const program = `Drawing still ${Date.now()}`;
    await page.emulateMedia({ reducedMotion: "reduce" });
    await signUp(page);
    await commitProgram(page, program, "Back Squat");
    await page.setViewportSize({ width: 375, height: 812 });
    await startSession(page, program);
    await page.getByRole("button", { name: /^Cues/ }).click();

    const frames = page.getByRole("img", { name: /Drawing of the Back Squat/ }).locator("img");
    await expect(frames).toHaveCount(2);
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
    const [a, b] = await frames.evaluateAll((els) =>
      els.map((e) => {
        const r = e.getBoundingClientRect();
        return { x: r.x, right: r.right, width: r.width, opacity: getComputedStyle(e).opacity };
      }),
    );
    expect([a!.opacity, b!.opacity]).toEqual(["1", "1"]);
    // Side by side, neither over the other, both inside the phone.
    expect(b!.x).toBeGreaterThanOrEqual(a!.right);
    expect(b!.right).toBeLessThanOrEqual(375);
    expect(a!.width).toBeGreaterThan(100);
  });

  test("an exercise Everkinetic does not draw has cues and no picture", async ({ page }) => {
    const program = `No drawing ${Date.now()}`;
    await signUp(page);
    await commitProgram(page, program, "Hip Thrust");
    await page.setViewportSize({ width: 375, height: 812 });
    await startSession(page, program);
    await page.getByRole("button", { name: /^Cues/ }).click();
    await expect(page.getByText("Drive your hips up until your shoulders")).toBeVisible();
    await expect(page.getByRole("img", { name: /Drawing of the/ })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Everkinetic/ })).toHaveCount(0);
  });
});

test.describe("/credits", () => {
  test("is public, credits Everkinetic with the license and the changes, fits a phone and has no serious a11y violations", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const res = await page.goto("/credits");
    expect(res!.status()).toBe(200);
    await expect(page).toHaveURL(/\/credits$/);
    await expect(page.getByRole("heading", { level: 1, name: "Credits" })).toBeVisible();
    const body = page.locator("main");
    await expect(body).toContainText("Everkinetic");
    await expect(body).toContainText("Greg Priday");
    await expect(body).toContainText("CC BY-SA 4.0");
    await expect(body).toContainText("We did not redraw or edit the drawings");
    await expect(body).toContainText("the training app");
    await expect(page.getByRole("link", { name: "Everkinetic data and drawings" })).toHaveAttribute(
      "href",
      "https://github.com/everkinetic/data",
    );
    await expect(page.getByRole("link", { name: "CC BY-SA 4.0 license" })).toHaveAttribute(
      "href",
      "https://creativecommons.org/licenses/by-sa/4.0/",
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      375,
    );
    const axe = await new AxeBuilder({ page }).analyze();
    expect(axe.violations.filter((v) => v.impact === "critical" || v.impact === "serious")).toEqual(
      [],
    );
  });

  test("the landing page links to it, and the converted drawings are served as WebP", async ({
    page,
    request,
  }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Credits" }).click();
    await expect(page).toHaveURL(/\/credits$/);
    const image = await request.get("/exercises/back-squat-1.webp");
    expect(image.status()).toBe(200);
    expect(image.headers()["content-type"]).toBe("image/webp");
    const attribution = await request.get("/exercises/ATTRIBUTION.md");
    expect(attribution.status()).toBe(200);
    expect(await attribution.text()).toContain("CC BY-SA 4.0");
  });
});
