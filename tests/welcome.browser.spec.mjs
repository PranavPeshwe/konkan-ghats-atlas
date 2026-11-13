import { test, expect } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { dismissWelcome } from './browser-helpers.mjs';

const url = pathToFileURL(path.resolve('pune_to_konkan.html')).href;
const routeCount = page => page.evaluate(() => window.__atlas.map.raw.getStyle().sources['atlas-routes'].data.features.length);
async function ready(page) {
  await expect.poll(() => page.evaluate(() => window.__atlas?.map.ready)).toBe(true);
}

test('page opens with names, no routes, and a keyboard-accessible welcome modal on every reload', async ({ page }) => {
  await page.goto(url);
  await expect(page.getByRole('dialog', { name: 'Click a ghat or beach to get started.' })).toBeVisible();
  await expect(page.locator('#welcome-start')).toBeFocused();
  await ready(page);
  await expect.poll(() => page.evaluate(() => window.__atlas.map.raw.queryRenderedFeatures({ layers: ['atlas-place-labels'] }).length)).toBeGreaterThan(0);
  expect(await routeCount(page)).toBe(0);
  await expect(page.locator('#route-list .route-card')).toHaveCount(0);
  const places = await page.evaluate(() => {
    const { atlas, map } = window.__atlas;
    return {
      expected: [atlas.origin.id, ...atlas.ghats.map(place => place.id), ...atlas.beaches.map(place => place.id)].sort(),
      actual: map.raw.getStyle().sources['atlas-places'].data.features.map(feature => feature.properties.id).sort()
    };
  });
  expect(places.actual).toEqual(places.expected);
  await page.screenshot({ path: `test-results/welcome-${test.info().project.name}.png` });
  await page.keyboard.press('Escape');
  await expect(page.locator('#welcome-dialog')).toBeHidden();
  expect(await routeCount(page)).toBe(0);
  await expect(page.locator('#fit-selection')).toBeDisabled();
  await expect(page.locator('#heading-index')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('#welcome-dialog')).toBeVisible();
  await ready(page);
  expect(await routeCount(page)).toBe(0);
});

test('search alone keeps routes hidden, while choosing a ghat or beach reveals them and reset clears them', async ({ page }) => {
  await page.route('https://**/*', route => route.abort());
  await page.goto(url);
  await dismissWelcome(page);
  await ready(page);
  await page.locator('#search').fill('Tamhini');
  await expect(page.locator('[data-entity="tamhini"][data-kind="ghats"]')).toBeVisible();
  expect(await routeCount(page)).toBe(0);
  await expect(page.locator('#route-list .route-card')).toHaveCount(0);
  await page.locator('[data-entity="tamhini"][data-kind="ghats"]').click();
  await expect.poll(() => routeCount(page)).toBe(10);
  await expect(page.locator('#route-list .route-card')).toHaveCount(10);
  await page.locator('#search').fill('');
  await page.locator('[data-mode="beaches"]').click();
  expect(await routeCount(page)).toBe(0);
  await page.locator('[data-entity="diveagar"]').click();
  await expect.poll(() => routeCount(page)).toBe(5);
  await expect(page.locator('#selection-count')).toHaveText('5');
  await page.locator('#reset-all').click();
  expect(await routeCount(page)).toBe(0);
  await expect(page.locator('#route-list .route-card')).toHaveCount(0);
  await expect(page.locator('#welcome-dialog')).toBeHidden();
});

test('clicking a map name away from its marker selects the place exactly once', async ({ page }) => {
  await page.route('https://**/*', route => route.abort());
  await page.goto(url);
  await dismissWelcome(page);
  await ready(page);
  await page.evaluate(() => {
    const { map, atlas, store } = window.__atlas;
    map.raw.jumpTo({ center: atlas.ghats.find(ghat => ghat.id === 'tamhini').coordinates, zoom: 9 });
    window.__nameFocusCount = 0;
    store.subscribe((_, action) => { if (action.type === 'focus' && action.id === 'tamhini') window.__nameFocusCount++; });
  });
  const labelPoint = () => page.evaluate(() => {
    const { map, atlas } = window.__atlas;
    const point = map.raw.project(atlas.ghats.find(ghat => ghat.id === 'tamhini').coordinates);
    for (const offset of [25, 35, 45, 55]) {
      const pixel = [point.x + offset, point.y];
      const label = map.raw.queryRenderedFeatures(pixel, { layers: ['atlas-place-labels'] }).some(feature => feature.properties.id === 'tamhini');
      const marker = map.raw.queryRenderedFeatures(pixel, { layers: ['atlas-place-circles'] }).length;
      if (label && !marker) return pixel;
    }
    return null;
  });
  await expect.poll(labelPoint).not.toBeNull();
  const point = await labelPoint();
  const canvas = await page.locator('.maplibregl-canvas').boundingBox();
  await page.mouse.click(canvas.x + point[0], canvas.y + point[1]);
  await expect.poll(() => routeCount(page)).toBe(10);
  expect(await page.evaluate(() => window.__nameFocusCount)).toBe(1);
  await expect(page.locator('#detail-tamhini')).toHaveText('Tamhini Ghat');
});
