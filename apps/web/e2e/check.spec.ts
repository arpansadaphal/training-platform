import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Session E: the public Program Checker (/check). No account for the checking itself; sign-up is the
 * optional last step. Rate-limit tests live in rate-limit.spec.ts because they need their own server env.
 */

const THREE_DAY_PASTE = [
  "Push",
  "Barbell Bench Press 3x8-10",
  "Overhead Press 3x8-10",
  "",
  "Pull",
  "Barbell Row 3x8-10",
  "Pull-Up 3x6-10",
  "",
  "Legs",
  "Back Squat 3x8-10",
  "Romanian Deadlift 3x8-10",
].join("\n");

async function paste(page: Page, text: string): Promise<void> {
  await page.goto("/check");
  await page.getByLabel("Your routine").fill(text);
}

async function checkPastedProgram(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Looks right" }).click();
  await page.getByRole("button", { name: "Check my program" }).click();
  await expect(page).toHaveURL(/\/check\/[A-Za-z0-9_-]+$/);
}

test("paste a routine -> confirm the reading -> assessment renders", async ({ page }) => {
  await paste(page, THREE_DAY_PASTE);

  await expect(page.getByRole("heading", { name: "Parsed as 3 days" })).toBeVisible();
  await expect(page.getByText("Day 1 (Push)")).toBeVisible();
  await expect(page.getByText("Day 3 (Legs)")).toBeVisible();
  // Not confirmed yet, so checking is off.
  await expect(page.getByRole("button", { name: "Check my program" })).toBeDisabled();

  await checkPastedProgram(page);
  await expect(page.getByRole("heading", { name: "Assessment" })).toBeVisible();
  await expect(page.getByText("6 exercises", { exact: false })).toBeVisible();
  await expect(page.getByText(/Provisional fit/).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /See evidence/ }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Create account and save this program" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Create account and save this program" })).toBeVisible();
});

test("the Day 1 - Push / Rest paste reads as three days, not five", async ({ page }) => {
  await paste(
    page,
    ["Day 1 - Push", "Bench 3x8", "", "Rest", "", "Day 2 - Pull", "Row 3x8", "", "Rest", "", "Day 3 - Legs", "Squat 3x8"].join("\n"),
  );
  await expect(page.getByRole("heading", { name: "Parsed as 3 days" })).toBeVisible();
  await expect(page.getByText("2 rest lines skipped.")).toBeVisible();
});

test("pick PPL 6-day -> assessment renders", async ({ page }) => {
  await page.goto("/check");
  await page.getByRole("tab", { name: "Pick a common split" }).click();
  await expect(page.getByRole("link", { name: /3-day full body/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Upper\/Lower 4-day/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Bro split 5-day/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Beginner 2-day/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Home dumbbells 3-day/ })).toBeVisible();
  await page.getByRole("link", { name: /PPL 6-day/ }).click();

  await expect(page).toHaveURL(/\/check\/[A-Za-z0-9_-]+$/);
  await expect(page.getByText("6 days, 30 exercises")).toBeVisible();
  await expect(page.getByText(/Provisional fit/).first()).toBeVisible();
  await expect(page.getByText("Cross-muscle balance").first()).toBeVisible();
});

test("an unmatched exercise shows the confirmation step and blocks checking until answered", async ({ page }) => {
  await paste(page, ["Bench 3x8", "Back Squat 3x8", "Barbell Row 3x8", "Zottman Spin 3x8"].join("\n"));

  await expect(page.getByRole("heading", { name: "Confirm these exercises" })).toBeVisible();
  await expect(page.getByText('Line 1: "Bench 3x8". Did you mean "Barbell Bench Press"?')).toBeVisible();
  await expect(page.getByText(/Line 4: "Zottman Spin 3x8". No exercise in the library matches\./)).toBeVisible();

  await page.getByRole("button", { name: "Looks right" }).click();
  await expect(page.getByRole("button", { name: "Check my program" })).toBeDisabled();

  await page.getByRole("button", { name: "Yes" }).click();
  await page.getByRole("button", { name: "Remove line" }).click();
  await expect(page.getByRole("heading", { name: "Confirm these exercises" })).toHaveCount(0);
  await expect(page.getByText("Barbell Bench Press 3×8")).toBeVisible();
  await expect(page.getByRole("button", { name: "Check my program" })).toBeEnabled();
});

test("'Choose different' opens the exercise picker", async ({ page }) => {
  await paste(page, ["Zottman Spin 3x8", "Back Squat 3x8", "Barbell Row 3x8", "Pull-Up 3x8"].join("\n"));
  await page.getByRole("button", { name: "Choose different" }).click();
  await page.getByLabel("Choose an exercise").selectOption({ index: 1 });
  await page.getByRole("button", { name: "Add exercise" }).click();
  await expect(page.getByRole("heading", { name: "Confirm these exercises" })).toHaveCount(0);
});

test("lines with no readable sets and reps are listed and can be deleted", async ({ page }) => {
  await paste(page, ["Back Squat 3x8", "Barbell Row 3x8", "Pull-Up 3x8", "keep it easy this week"].join("\n"));
  await expect(page.getByRole("heading", { name: "Could not parse" })).toBeVisible();
  await expect(page.getByText("Line 4: keep it easy this week")).toBeVisible();
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("heading", { name: "Could not parse" })).toHaveCount(0);
});

test("blank-line sections of one exercise are merged, with a way to undo", async ({ page }) => {
  await paste(page, "Barbell Bench Press 3x8\n\nBarbell Row 3x8\n\nBack Squat 3x8");
  await expect(page.getByRole("heading", { name: "Parsed as 1 day" })).toBeVisible();
  await page.getByRole("button", { name: "They are separate days" }).click();
  await expect(page.getByRole("heading", { name: "Parsed as 3 days" })).toBeVisible();
});

test("'Merge all into one day' collapses the reading", async ({ page }) => {
  await paste(page, THREE_DAY_PASTE);
  await page.getByRole("button", { name: "Merge all into one day" }).click();
  await expect(page.getByRole("heading", { name: "Parsed as 1 day" })).toBeVisible();
});

test("/check/about renders the limits and links back to /check", async ({ page }) => {
  await page.goto("/check/about");
  await expect(page.getByRole("heading", { name: "About the Program Checker" })).toBeVisible();
  await expect(page.getByText("21 match the headline the coaches gave.", { exact: false })).toBeVisible();
  await expect(page.getByText("If any exercise causes pain, stop and consult a professional.")).toBeVisible();
  await page.getByRole("link", { name: "Continue to the checker →" }).click();
  await expect(page).toHaveURL(/\/check$/);
  await expect(page.getByRole("heading", { name: "Program Checker", level: 1 })).toBeVisible();
});

test("the landing page links to the checker", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Or check a program you already have →" }).click();
  await expect(page).toHaveURL(/\/check$/);
});

test("a bad hash is a 404", async ({ page }) => {
  const response = await page.goto("/check/not-a-program");
  expect(response?.status()).toBe(404);
});

test.describe("sign-up handoff", () => {
  // Sign-up, bcrypt and first-compile of /app on a cold dev server run well past the 30s default.
  test.describe.configure({ timeout: 90_000 });

  async function signUp(page: Page): Promise<void> {
    await page.getByLabel("Email").fill(`check-${crypto.randomUUID()}@example.test`);
    await page.getByLabel("Password (min 8 characters)").fill("correct-horse-battery-staple");
    await page.getByRole("button", { name: "Create account" }).click();
  }

  test("signup with a pending program -> banner -> Save opens the Builder on the draft", async ({ page }) => {
    await page.goto("/check");
    await page.getByRole("tab", { name: "Pick a common split" }).click();
    await page.getByRole("link", { name: /Beginner 2-day/ }).click();
    await page.getByRole("button", { name: "Create account and save this program" }).click();
    await expect(page).toHaveURL(/\/signup\?from=check$/);
    await expect(page.getByText("Sign up to save the program you just checked")).toBeVisible();

    await signUp(page);
    await expect(page).toHaveURL(/\/app$/, { timeout: 30_000 });
    await expect(page.getByText("You checked a program before signing up.")).toBeVisible();
    await page.getByRole("button", { name: "Save", exact: true }).click();

    await expect(page).toHaveURL(/\/app\/programs\/[^/]+\/build$/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "Overall" })).toBeVisible({ timeout: 30_000 });
  });

  test("Discard forgets the pending program", async ({ page }) => {
    await page.goto("/check");
    await page.getByRole("tab", { name: "Pick a common split" }).click();
    await page.getByRole("link", { name: /Beginner 2-day/ }).click();
    await page.getByRole("button", { name: "Create account and save this program" }).click();
    await signUp(page);
    await expect(page).toHaveURL(/\/app$/, { timeout: 30_000 });
    await page.getByRole("button", { name: "Discard" }).click();
    await expect(page.getByText("You checked a program before signing up.")).toHaveCount(0);
    await page.reload();
    await expect(page.getByText("You checked a program before signing up.")).toHaveCount(0);
  });

  test("without sessionStorage the program rides the URL and comes back as ?import=1", async ({ page }) => {
    await page.addInitScript(() => {
      Storage.prototype.setItem = () => {
        throw new Error("storage blocked");
      };
    });
    await page.goto("/check");
    await page.getByRole("tab", { name: "Pick a common split" }).click();
    await page.getByRole("link", { name: /Beginner 2-day/ }).click();
    await page.getByRole("button", { name: "Create account and save this program" }).click();
    await expect(page).toHaveURL(/\/signup\?from=check&h=/);

    await signUp(page);
    await expect(page).toHaveURL(/\/check\/[A-Za-z0-9_-]+\?import=1$/, { timeout: 30_000 });
    await page.getByRole("button", { name: "Save this program", exact: true }).click();
    await expect(page).toHaveURL(/\/app\/programs\/[^/]+\/build$/, { timeout: 30_000 });
  });

  test("?import=1 shows no save button to someone who is not signed in", async ({ page }) => {
    await page.goto("/check");
    await page.getByRole("tab", { name: "Pick a common split" }).click();
    await page.getByRole("link", { name: /Beginner 2-day/ }).click();
    await expect(page).toHaveURL(/\/check\/[A-Za-z0-9_-]+$/);
    await page.goto(`${page.url()}?import=1`);
    await expect(page.getByText(/Provisional fit/).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Save this program", exact: true })).toHaveCount(0);
  });
});

test.describe("375px", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  /** No horizontal scroll, and every visible control is at least 44px (43.5 allows for sub-pixel rounding). */
  async function expectPhoneFit(page: Page, where: string): Promise<void> {
    await page.waitForLoadState("networkidle");
    if (process.env.CHECK_SHOTS) {
      await page.screenshot({ path: `${process.env.CHECK_SHOTS}/${where.replace(/[^a-z0-9]+/gi, "-")}.png`, fullPage: true });
    }
    const report = await page.evaluate(() => {
      const vw = window.innerWidth;
      const small: string[] = [];
      for (const el of Array.from(document.querySelectorAll<HTMLElement>("a, button, input, select, textarea, summary"))) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0 || getComputedStyle(el).visibility === "hidden") continue;
        if (r.width < 43.5 || r.height < 43.5) small.push(`${el.tagName} "${(el.textContent ?? "").trim().slice(0, 30)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
      return { scrollWidth: document.documentElement.scrollWidth, vw, small };
    });
    expect(report.scrollWidth, `${where}: horizontal scroll`).toBeLessThanOrEqual(report.vw);
    expect(report.small, `${where}: controls under 44px`).toEqual([]);
  }

  test("/check, /check/[hash] and /check/about fit a phone", async ({ page }) => {
    await page.goto("/check");
    await expectPhoneFit(page, "check empty");

    await page.getByLabel("Your routine").fill(`${THREE_DAY_PASTE}\nZottman Spin 3x8\nkeep it easy`);
    await expect(page.getByRole("heading", { name: "Confirm these exercises" })).toBeVisible();
    await expectPhoneFit(page, "check reading");

    await page.getByRole("tab", { name: "Pick a common split" }).click();
    await expectPhoneFit(page, "check presets");

    await page.getByRole("link", { name: /PPL 6-day/ }).click();
    await expect(page.getByText(/Provisional fit/).first()).toBeVisible();
    await expectPhoneFit(page, "check result");

    await page.goto("/check/about");
    await expectPhoneFit(page, "check about");
  });
});

test("no critical or serious accessibility violations on the three public pages", async ({ page }) => {
  async function scan(where: string): Promise<void> {
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const blocking = results.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
    expect(blocking.map((v) => `${where}: ${v.id} (${v.nodes.length})`)).toEqual([]);
  }

  await page.goto("/check");
  await page.getByLabel("Your routine").fill(`${THREE_DAY_PASTE}\nZottman Spin 3x8`);
  await expect(page.getByRole("heading", { name: "Confirm these exercises" })).toBeVisible();
  await scan("/check");

  await page.getByRole("tab", { name: "Pick a common split" }).click();
  await page.getByRole("link", { name: /PPL 6-day/ }).click();
  await expect(page.getByText(/Provisional fit/).first()).toBeVisible();
  await scan("/check/[hash]");

  await page.goto("/check/about");
  await scan("/check/about");
});
