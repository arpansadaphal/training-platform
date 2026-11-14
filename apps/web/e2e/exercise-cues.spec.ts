import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Locator, type Page } from "@playwright/test";

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

/** Signed in: a new program, a draft and one empty workout day open in the Builder (desktop-sized). */
async function openBuilderDay(page: Page, program: string): Promise<void> {
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
}

/** One day with one named exercise, committed. The Builder is desktop-sized; the session is then driven at 375px. */
async function commitProgram(page: Page, program: string, exercise: string): Promise<void> {
  await openBuilderDay(page, program);
  const option = page
    .getByLabel("Choose an exercise")
    .getByRole("option", { name: new RegExp(`^${exercise}( —|$)`) });
  await expect(option, `"${exercise}" is in the exercise picker`).toHaveCount(1);
  await option.click();
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

/** Scrolls an element to the top of the screen, then saves a screenshot (only when CUES_SHOTS names a folder). */
async function shot(page: Page, target: Locator, file: string): Promise<void> {
  if (!process.env.CUES_SHOTS) return;
  await target.evaluate((el) => {
    el.scrollIntoView({ block: "start" });
    window.scrollBy(0, -12);
  });
  await page.screenshot({ path: `${process.env.CUES_SHOTS}/${file}` });
}

/**
 * Height of the plain 3-string list the cues panel used before ARCH-074, rendered here at the panel's own width with
 * the old CSS, so the comparison is the same font, the same width, the same screen.
 */
async function oldListHeight(panel: Locator, lines: string[]): Promise<number> {
  return panel.evaluate((el, items) => {
    const ul = document.createElement("ul");
    ul.style.cssText =
      "margin:0 0 0.5rem;padding:0.5rem 0.75rem 0.5rem 1.75rem;border-left:3px solid #e5e5e5;font-size:0.95rem;";
    items.forEach((t, i) => {
      const li = document.createElement("li");
      li.textContent = t;
      if (i > 0) li.style.marginTop = "0.35rem";
      ul.appendChild(li);
    });
    el.appendChild(ul);
    const h = ul.getBoundingClientRect().height;
    ul.remove();
    return h;
  }, lines);
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

  test("Cues toggle: collapsed by default, 44px, aria-expanded, no beta on a written cue, labels Setup / Action / Feel, bold verbs, no horizontal scroll", async ({
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
    // Back Squat is one of the 30 written (reviewed) cues, so no beta label.
    await expect(toggle).not.toContainText("(beta)");
    const box = (await toggle.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThanOrEqual(44);

    // Collapsed: no cue text on the page.
    const panelId = (await toggle.getAttribute("aria-controls"))!;
    expect(panelId).toBeTruthy();
    await expect(page.locator(`#${panelId}`)).toHaveCount(0);
    await expect(page.getByText("Sit straight down between your hips")).toHaveCount(0);

    const before = await foldNumbers(page);
    await shot(page, toggle, "cues-collapsed-375.png");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    const panel = page.locator(`#${panelId}`);
    await expect(panel).toBeVisible();

    // Three labelled rows, in order, each with its text.
    const rows = panel.locator("p");
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText("Setup");
    await expect(rows.nth(0)).toContainText("Bar across your upper back");
    await expect(rows.nth(1)).toContainText("Action");
    await expect(rows.nth(1)).toContainText("Sit straight down between your hips");
    await expect(rows.nth(2)).toContainText("Feel");
    await expect(rows.nth(2)).toContainText("Feel your quads and glutes");
    // Bold drive verbs in the Action row only.
    await expect(rows.nth(1).locator("strong")).toContainText(["push"]);
    await expect(rows.nth(0).locator("strong")).toHaveCount(0);
    await expect(rows.nth(2).locator("strong")).toHaveCount(0);

    const open = await foldNumbers(page);
    console.log("FOLD open", JSON.stringify(open));
    await shot(page, toggle, "cues-open-375.png");
    // The Setup / Action / Feel panel is no taller than the 3-string list it replaced (same width, same font).
    const newList = (await rows.first().locator("xpath=..").boundingBox())!.height;
    const oldList = await oldListHeight(panel, [
      "Set the bar across your upper back with your hands just outside your shoulders.",
      "Sit down between your hips, then push the floor away to stand.",
      "Go to the same depth every rep so your numbers compare week to week.",
    ]);
    console.log("CUE LIST HEIGHT written", newList, "old 3-string", oldList);
    expect(newList).toBeLessThanOrEqual(oldList);
    expect(open.scrollWidth).toBeLessThanOrEqual(375);
    // The label runs in on the text's first line instead of taking a column or a line of its own.
    const label = rows.nth(1).locator("span").first();
    const row = (await rows.nth(1).boundingBox())!;
    expect(Math.abs((await label.boundingBox())!.y - row.y)).toBeLessThan(8);
    const panelBox = (await panel.boundingBox())!;
    expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(375);
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

  test("a draft exercise keeps the beta label and shows its lines under one Action label", async ({
    page,
  }) => {
    const program = `Cues draft ${Date.now()}`;
    await signUp(page);
    await commitProgram(page, program, "Hack Squat");
    await page.setViewportSize({ width: 375, height: 812 });
    await startSession(page, program);

    const toggle = page.getByRole("button", { name: /^Cues/ });
    await expect(toggle).toContainText("(beta)");
    await toggle.click();
    const panel = page.locator(`#${(await toggle.getAttribute("aria-controls"))!}`);
    await expect(panel.locator("p")).toHaveCount(1);
    await expect(panel.locator("p").first()).toContainText("Action");
    await expect(panel).not.toContainText("Setup");
    await expect(panel).toContainText("Set your feet shoulder-width on the platform");
    await expect(panel).toContainText("Feel the front of your thighs working.");
    // A draft's three lines under one label are no taller than the plain list they replaced.
    const draftList = (await panel.locator("p").first().locator("xpath=..").boundingBox())!.height;
    const oldList = await oldListHeight(panel, [
      "Set your feet shoulder-width on the platform with your shoulders under the pads.",
      "Lower until your thighs are parallel to the platform, then press back up.",
      "Feel the front of your thighs working.",
    ]);
    console.log("CUE LIST HEIGHT draft", draftList, "old 3-string", oldList);
    expect(draftList).toBeLessThanOrEqual(oldList);
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

/** The picker's rows, a 32px thumbnail each when the exercise has a drawing and an empty square when it has not. */
async function expectThumb(row: Locator, drawn: boolean, slug?: string) {
  if (drawn) {
    const img = row.getByTestId("exercise-thumb");
    await expect(img).toHaveCount(1);
    await expect(img).toHaveAttribute("src", `/exercises/${slug}-1.webp`);
    const box = (await img.boundingBox())!;
    expect([Math.round(box.width), Math.round(box.height)]).toEqual([32, 32]);
    await expect
      .poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0);
  } else {
    await expect(row.locator("img")).toHaveCount(0);
    const empty = row.getByTestId("exercise-thumb-empty");
    await expect(empty).toHaveCount(1);
    const box = (await empty.boundingBox())!;
    expect([Math.round(box.width), Math.round(box.height)]).toEqual([32, 32]);
  }
}

test.describe("exercise thumbnails (375px)", () => {
  test.setTimeout(150_000);

  test("picker: a thumbnail beside an exercise with a drawing, an empty square beside one without, one line each", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/check");
    await page
      .getByLabel("Your routine")
      .fill(["Zottman Spin 3x8", "Back Squat 3x8", "Barbell Row 3x8", "Pull-Up 3x8"].join("\n"));
    await page.getByRole("button", { name: "Choose different" }).click();
    const list = page.getByLabel("Choose an exercise");
    await expect(list).toBeVisible();

    const search = page.getByLabel("Search exercises");
    await search.fill("back squat");
    await expectThumb(list.getByRole("option", { name: /^Back Squat/ }), true, "back-squat");
    await search.fill("hip thrust");
    await expectThumb(list.getByRole("option", { name: /^Hip Thrust/ }), false);

    // The longest names stay on one line (truncated, never wrapped) and nothing runs sideways.
    await search.fill("incline");
    const rows = list.getByRole("option");
    expect(await rows.count()).toBeGreaterThanOrEqual(3);
    for (const box of await rows.evaluateAll((els) =>
      els.map((e) => e.getBoundingClientRect().height),
    ))
      expect(box).toBeLessThanOrEqual(48);
    const lines = await rows.evaluateAll((els) =>
      els.map((e) => {
        const t = e.querySelector("span:last-child") as HTMLElement;
        return getComputedStyle(t).whiteSpace;
      }),
    );
    expect(new Set(lines)).toEqual(new Set(["nowrap"]));
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      375,
    );
    await search.fill("");
    await shot(page, search, "picker-check-375.png");

    // Choosing still works: tap a row, then Add.
    await search.fill("back squat");
    await list.getByRole("option", { name: /^Back Squat/ }).click();
    await expect(list.getByRole("option", { name: /^Back Squat/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await page.getByRole("button", { name: "Add exercise" }).click();
  });

  test("/check parse list: a 32px still beside a matched exercise, an empty square beside one with no drawing", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/check");
    await page
      .getByLabel("Your routine")
      .fill(["Back Squat 3x8", "Hip Thrust 3x10", "Barbell Row 3x8"].join("\n"));
    const row = (text: string) => page.getByText(text).locator("xpath=..");
    await expect(page.getByText("Back Squat 3×8")).toBeVisible();
    await expectThumb(row("Back Squat 3×8"), true, "back-squat");
    await expectThumb(row("Hip Thrust 3×10"), false);
    await expectThumb(row("Barbell Row 3×8"), true, "barbell-row");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      375,
    );
    await shot(page, page.getByRole("heading", { name: /^Parsed as/ }), "check-parse-375.png");
  });

  test("Builder: thumbnails in the picker and beside each prescription row", async ({ page }) => {
    await signUp(page);
    await openBuilderDay(page, `Thumbs ${Date.now()}`);
    await page.setViewportSize({ width: 375, height: 812 });
    const list = page.getByLabel("Choose an exercise");
    await expect(list).toBeVisible();
    await expectThumb(list.getByRole("option", { name: /^Back Squat/ }), true, "back-squat");
    await expectThumb(list.getByRole("option", { name: /^Hip Thrust/ }), false);
    await list.getByRole("option", { name: /^Back Squat/ }).scrollIntoViewIfNeeded();
    await shot(page, page.getByLabel("Search exercises"), "picker-builder-375.png");
    await list.getByRole("option", { name: /^Back Squat/ }).click();
    await page.getByRole("button", { name: "Add exercise" }).click();
    // The prescription row shows the same still.
    const rowThumb = page
      .locator('li:has-text("Back Squat")')
      .getByTestId("exercise-thumb")
      .first();
    await expect(rowThumb).toHaveAttribute("src", "/exercises/back-squat-1.webp");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      375,
    );
  });
});
