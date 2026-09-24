import { test, expect } from "@playwright/test";

/**
 * Phase 0's single required E2E test:
 * "loads the landing page and asserts it renders."
 */
test("landing page renders", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Design training programs",
  );
  await expect(page.getByRole("link", { name: "Sign up" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Log in" })).toBeVisible();
});