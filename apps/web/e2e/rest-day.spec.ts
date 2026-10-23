import { test, expect, type Page } from "@playwright/test";

/**
 * ARCH-061: a rest day in the Builder, in the rotation, in the day picker, and
 * moved past without counting as a missed session.
 */

async function signUp(page: Page): Promise<void> {
  await page.goto("/signup");
  await page.getByLabel("Email").fill(`rest-${crypto.randomUUID()}@example.test`);
  await page.getByLabel("Password").fill("correct-horse-battery-staple");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/app$/, { timeout: 30_000 });
}

test("rest day: build, rotate, pick, move past (375px for the session part)", async ({ page }) => {
  test.setTimeout(180_000);
  const name = `Rest ${Date.now()}`;
  await signUp(page);

  // ── Builder: a training day, then "+ Add rest day" ─────────────────────
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

  await page.getByRole("button", { name: "+ Add rest day" }).click();
  const dayNames = page.getByLabel("Workout day name");
  await expect(dayNames).toHaveCount(2);
  await expect(dayNames.nth(1)).toHaveValue("Rest");
  // The rest day offers no exercises: one picker only (the training day's).
  await expect(page.getByLabel("Choose an exercise")).toHaveCount(1);
  await expect(page.getByText(/Rest day: no exercises/)).toBeVisible();

  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Overall" })).toBeVisible();
  await page.getByRole("button", { name: "Commit", exact: true }).click();
  await expect(page.getByText(/Committed as version 1\./)).toBeVisible();

  // ── Train day 1 on a phone ─────────────────────────────────────────────
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/train");
  const card = page.locator("li").filter({ hasText: name });
  await card.getByRole("button", { name: /Start training/ }).click();
  await expect(page).toHaveURL(/\/train\/session\/[^/]+$/);
  await page.getByRole("button", { name: "Start session" }).click();
  await page.getByRole("button", { name: "Mark complete" }).click();
  const anyway = page.getByRole("button", { name: "Complete anyway" });
  await anyway.waitFor({ timeout: 2_000 }).then(() => anyway.click(), () => undefined);
  await expect(page).toHaveURL(/\/summary$/);

  // ── The picker offers the rest day, labelled ───────────────────────────
  await page.goto("/train");
  await expect(card.getByText("Next up: Rest")).toBeVisible();
  const option = card.getByRole("option", { name: /Rest/ });
  await expect(option).toHaveCount(1);
  await expect(card.getByRole("button", { name: "Open rest day" })).toBeVisible();

  // Opening it creates the rest-day session; the dashboard then says so too.
  await card.getByRole("button", { name: "Open rest day" }).click();
  await expect(page).toHaveURL(/\/train\/session\/[^/]+$/);
  await page.goto("/app");
  await expect(page.getByText(/Next up: rest day/)).toBeVisible();
  await page.getByRole("link", { name: "Open rest day" }).click();
  await expect(page).toHaveURL(/\/train\/session\/[^/]+$/);

  // ── The rest-day screen ────────────────────────────────────────────────
  await expect(page.getByText("Rest day — no training scheduled.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Log one set" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Start session" })).toHaveCount(0);
  await expect(page.getByText("Post-session notes")).toHaveCount(0);
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(over).toBeLessThanOrEqual(0);
  const next = page.getByRole("button", { name: "Continue to next day" });
  expect((await next.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await next.click();
  await expect(page.getByText(/Rest day done\./)).toBeVisible();

  // ── Review: the rest day did not count as a skipped session ───────────
  await page.goto("/app");
  await page.getByRole("link", { name: "Review block" }).click();
  await expect(page.getByText(/No systematic deviations|Adherence/i).first()).toBeVisible();
  await expect(page.getByText(/sessions? skipped/i)).toHaveCount(0);
});
