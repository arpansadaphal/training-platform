// Helpers for the weight and effort pickers (Phase A3a.1). They are bottom
// sheets, so a test opens one, then taps an option.

import { expect, type Locator, type Page } from "@playwright/test";

/** The first logging weight picker button on the page (or `within`). */
export function weightButton(page: Page, within?: Locator): Locator {
  return (within ?? page).getByRole("button", { name: /^Weight \(/ }).first();
}

export function rpeButton(page: Page, within?: Locator): Locator {
  return (within ?? page).getByRole("button", { name: /^Effort \(RPE\)/ }).first();
}

/** Open the picker behind `button` and return its sheet. */
export async function openSheet(page: Page, button: Locator): Promise<Locator> {
  await button.click();
  const sheet = page.locator("dialog[open]");
  await expect(sheet).toBeVisible();
  return sheet;
}

/** Choose a weight by its number ("100", "62.5"), or "Bodyweight" / "Same as last". */
export async function chooseWeight(page: Page, value: string, within?: Locator): Promise<void> {
  const sheet = await openSheet(page, weightButton(page, within));
  if (value === "Bodyweight" || value === "Same as last") {
    await sheet.getByRole("button", { name: new RegExp(`^${value}`) }).click();
  } else {
    await sheet.locator(`[role="option"][data-value="${value}"]`).click();
  }
  await expect(sheet).toBeHidden();
}

/** Choose an effort by its RPE number (4, 6, 8, 9, 10). */
export async function chooseRpe(page: Page, rpe: number, within?: Locator): Promise<void> {
  const sheet = await openSheet(page, rpeButton(page, within));
  await sheet.locator(`[role="option"][data-value="${rpe}"]`).click();
  await expect(sheet).toBeHidden();
}
