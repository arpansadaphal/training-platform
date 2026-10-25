// Finding the current block's Review page from the app, the way a lifter would.
//
// The dashboard offers "Review block" only once the block has a completed
// session in it (an empty block has nothing to review). A spec that has not
// trained yet reaches Review through the program's history page, which lists
// every block, newest first.

import { expect, type Page } from "@playwright/test";

/** The Review href of the newest block of the user's primary program. */
export async function currentReviewHref(page: Page): Promise<string> {
  await page.goto("/app");
  const programLink = page.getByRole("link", { name: "View program" }).first();
  await expect(programLink).toBeVisible({ timeout: 30_000 });
  const programHref = await programLink.getAttribute("href");
  if (!programHref) throw new Error("View program link has no href");

  await page.goto(`${programHref}/history`);
  const reviewLink = page.locator('a[href^="/app/review/"]').first();
  await expect(reviewLink).toBeVisible({ timeout: 30_000 });
  const href = await reviewLink.getAttribute("href");
  if (!href || !href.startsWith("/app/review/")) {
    throw new Error(`Review link has unexpected href: ${href ?? "(null)"}`);
  }
  return href;
}
