import { test, expect } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { dismissWelcome } from './browser-helpers.mjs';
import { themes } from '../src/themes.js';

test('Bor switches independently between three real road alignments, with distinct colours and no tunnel terrain claim', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('https://**/*', route => route.abort());
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(pathToFileURL(path.resolve('pune_to_konkan.html')).href);
  await dismissWelcome(page);
  await expect.poll(() => page.evaluate(() => window.__atlas?.map.ready)).toBe(true);
  await page.locator('[data-entity="bor"]').click();
  await expect(page.locator('#route-list [data-current="true"]')).toHaveCount(30);
  await expect(page.locator('#detail-content')).toContainText('Three roads across Bor');
  await expect(page.locator('[data-profile-chart]')).toHaveCount(0);
  const variants = ['old-highway', 'expressway-missing-link', 'expressway-original'];
  for (const id of variants) {
    await page.locator(`[data-bor-alignment="${id}"]`).click();
    await expect(page.locator(`#route-list [data-current="true"][data-alignment="${id}"]`)).toHaveCount(10);
    await expect(page.locator('#route-list [data-current="true"]')).toHaveCount(10);
    await expect(page.locator(`[data-bor-alignment="${id}"]`)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-profile-chart]')).toHaveCount(id === 'old-highway' ? 1 : 0);
    const map = await page.evaluate(() => ({
      routes: window.__atlas.map.raw.getStyle().sources['atlas-routes'].data.features.map(feature => feature.properties.id),
      profileCount: window.__atlas.map.raw.getStyle().sources['atlas-ghat-section'].data.features.length,
      visible: [...document.querySelectorAll('#route-list [data-current="true"]')].map(card => card.dataset.routeCard)
    }));
    expect(map.routes.sort()).toEqual(map.visible.sort());
    expect(map.profileCount).toBe(id === 'old-highway' ? 1 : 0);
    await expect(page.locator('#route-list [data-google-route]').first()).toHaveAttribute('target', '_blank');
    await page.locator('#route-list [data-journey] summary').first().click();
    await expect(page.locator('#route-list [data-journey]').first().locator('[data-stage]')).toHaveCount(3);
  }
  await page.locator('[data-bor-alignment="all"]').click();
  for (const theme of themes) {
    const colors = await page.locator('#route-list [data-beach="alibag"]').evaluateAll(cards => cards.map(card => ({
      id: card.dataset.alignment, color: getComputedStyle(card).getPropertyValue('--route-color').trim()
    })));
    expect(new Set(colors.map(item => item.color)).size).toBe(3);
    for (const item of colors) {
      expect(await page.locator(`[data-bor-alignment="${item.id}"]`).evaluate(button => getComputedStyle(button).getPropertyValue('--variant-color').trim())).toBe(item.color);
    }
  }
  await page.locator('#bor-alignment-evidence').locator('..').locator(':scope > summary').click();
  await expect(page.locator('#bor-alignment-evidence')).toBeVisible();
  await page.locator('[data-bor-alignment="expressway-missing-link"]').click();
  await page.locator('#reset-all').click();
  expect(await page.evaluate(() => window.__atlas.store.state.borAlignment)).toBe('all');
  await page.locator('[data-entity="bor"]').click();
  await expect(page.locator('#route-list [data-current="true"]')).toHaveCount(30);
  await page.screenshot({ path: `test-results/bor-three-alignments-${test.info().project.name}.png` });
  expect(errors).toEqual([]);
});
