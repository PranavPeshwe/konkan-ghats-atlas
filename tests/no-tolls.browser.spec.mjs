import { test, expect } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { dismissWelcome } from './browser-helpers.mjs';

test('tolls are absent from controls, comparisons, details, runtime data and downloaded data', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('https://**/*', route => route.abort());
  await page.goto(pathToFileURL(path.resolve('pune_to_konkan.html')).href);
  await dismissWelcome(page);
  await page.locator('[data-entity="tamhini"]').click();
  await page.locator('#route-list [data-select]').first().check();
  await page.locator('#compare-button').click();
  await expect(page.locator('[data-weight]')).toHaveCount(4);
  await expect(page.locator('[data-weight="tolls"]')).toHaveCount(0);
  await expect(page.locator('.comparison-table th')).toHaveText(['ROUTE', 'DISTANCE', 'MODEL TIME', 'SCENERY', 'DEMAND', 'YOUR SCORE']);
  await expect(page.locator('.score')).toHaveCount(1);
  expect(await page.evaluate(() => JSON.stringify({
    atlas: window.__atlas.atlas, guide: window.__atlas.fieldGuide,
    weights: window.__atlas.store.state.weights
  }))).not.toMatch(/toll/i);
  await page.locator('#close-comparison').click();
  await page.locator('#about-button').click();
  const pending = page.waitForEvent('download');
  await page.locator('[data-download="data"]').click();
  const download = await pending;
  expect(await readFile(await download.path(), 'utf8')).not.toMatch(/toll/i);
  expect(await page.locator('body').textContent()).not.toMatch(/\btolls?\b/i);
  await page.locator('#close-about').click();
  await page.locator('#reset-all').click();
  expect(await page.evaluate(() => Object.keys(window.__atlas.store.state.weights))).toEqual(['time', 'distance', 'scenery', 'difficulty']);
  expect(errors).toEqual([]);
});
