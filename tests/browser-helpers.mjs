import { expect } from '@playwright/test';

export async function dismissWelcome(page) {
  await expect(page.locator('#welcome-dialog')).toBeVisible();
  await page.locator('#welcome-start').click();
  await expect(page.locator('#welcome-dialog')).toBeHidden();
}
