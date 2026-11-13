import { test, expect } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { dismissWelcome } from './browser-helpers.mjs';

test('creator credit appears only at the top of About in all languages, with Ocean fixed', async ({ page }) => {
  await page.route('https://**/*', route => route.abort());
  await page.goto(pathToFileURL(path.resolve('pune_to_konkan.html')).href);
  await dismissWelcome(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'ocean');
  await expect(page.locator('#theme-select, [for="theme-select"]')).toHaveCount(0);
  await expect(page.locator('#creator-credit')).toBeHidden();
  for (const language of ['en', 'mr', 'hi']) {
    await page.locator('#language-select').selectOption(language);
    await page.locator('#about-button').click();
    await expect(page.locator('#about-content > :first-child')).toHaveAttribute('id', 'creator-credit');
    await expect(page.locator('#creator-credit')).toHaveText(language === 'en' ? 'Created by: Pranav Peshwe' : 'निर्माता: Pranav Peshwe');
    await expect(page.getByText('Pranav Peshwe', { exact: true })).toHaveCount(1);
    await expect(page.locator('#about-content')).not.toContainText('Colour themes');
    await page.screenshot({ path: `test-results/about-credit-${language}-${test.info().project.name}.png` });
    await page.locator('#close-about').click();
    await expect(page.locator('#creator-credit')).toBeHidden();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'ocean');
  }
});
