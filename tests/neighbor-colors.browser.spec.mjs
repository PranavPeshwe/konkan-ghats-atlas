import { test, expect } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { themes } from '../src/themes.js';
import { dismissWelcome } from './browser-helpers.mjs';

test('neighboring controls use distinct theme colours without restoring the removed index', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('https://**/*', route => route.abort());
  await page.goto(pathToFileURL(path.resolve('pune_to_konkan.html')).href);
  await dismissWelcome(page);
  await page.locator('[data-entity="tamhini"]').click();
  for (const theme of themes) {
    await expect(page.locator('#heading-index, .catalog-bottom')).toHaveCount(0);
    const groups = await page.evaluate(() => {
      const colors = selector => [...document.querySelectorAll(selector)].map(element => getComputedStyle(element).backgroundColor);
      return {
        header: colors('#language-select, #about-button, #compare-button'),
        tabs: colors('.tabs button'),
        mapActions: colors('.map-actions button'),
        stats: colors('.detail-stats > div'),
        filterRowOne: colors('#max-distance, #max-time'),
        filterRowTwo: colors('#difficulty, #scenery'),
        filterColumnOne: colors('#max-distance, #difficulty'),
        filterColumnTwo: colors('#max-time, #scenery'),
        profile: colors('.profile-stats > span'),
        routeActions: colors('#route-list .route-card:first-child .route-card-actions > *')
      };
    });
    for (const [name, colors] of Object.entries(groups)) {
      expect(colors.length, name).toBeGreaterThan(1);
      for (let index = 1; index < colors.length; index++) expect(colors[index], `${theme.id}: ${name}`).not.toBe(colors[index - 1]);
    }
    await page.screenshot({ path: `test-results/neighbor-colors-${theme.id}-${test.info().project.name}.png` });
  }
  await page.locator('#reset-all').click();
  await expect(page.locator('#heading-index, .catalog-bottom')).toHaveCount(0);
  await expect(page.locator('#theme-select')).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'ocean');
  expect(errors).toEqual([]);
});
