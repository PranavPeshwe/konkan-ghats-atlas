import { test, expect } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { themes } from '../src/themes.js';
import { dismissWelcome } from './browser-helpers.mjs';

const url = pathToFileURL(path.resolve('pune_to_konkan.html')).href;
async function openMap(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (/Basemap: layers\.(water|coastal)/.test(message.text())) errors.push(message.text());
  });
  await page.goto(url);
  await dismissWelcome(page);
  await expect.poll(() => page.evaluate(() => window.__atlas?.map.raw?.loaded()), { timeout: 45000 }).toBe(true);
  return errors;
}
const renderedNames = (page, layers) => page.evaluate(layers =>
  window.__atlas.map.raw.queryRenderedFeatures({ layers }).map(feature =>
    feature.properties['name:en'] || feature.properties.name_en || feature.properties['name:latin'] || feature.properties.name), layers);

test('Arabian Sea stays labelled on visible ocean as the coastal map is zoomed and panned', async ({ page }) => {
  const errors = await openMap(page);
  await expect.poll(() => renderedNames(page, ['coastal-sea-label'])).toContain('Arabian Sea');
  const before = await page.evaluate(() => window.__atlas.map.raw.getStyle().sources['atlas-coastal-sea'].data.features[0].geometry.coordinates);
  await page.evaluate(() => window.__atlas.map.raw.jumpTo({ center: [72.9, 18.42], zoom: 9 }));
  await expect.poll(() => renderedNames(page, ['coastal-sea-label'])).toContain('Arabian Sea');
  const after = await page.evaluate(() => {
    const map = window.__atlas.map.raw;
    const coordinates = map.getStyle().sources['atlas-coastal-sea'].data.features[0].geometry.coordinates;
    return {
      coordinates,
      overOcean: map.queryRenderedFeatures(map.project(coordinates), { layers: ['water'] }).some(feature => feature.properties.class === 'ocean')
    };
  });
  expect(after.coordinates).not.toEqual(before);
  expect(after.overOcean).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({ path: `test-results/water-sea-${test.info().project.name}.png` });
});

test('lake and river names render from vector tiles and remain readable in every theme', async ({ page }) => {
  const errors = await openMap(page);
  await page.evaluate(() => window.__atlas.map.raw.jumpTo({ center: [73.48, 18.48], zoom: 10 }));
  await expect.poll(() => renderedNames(page, ['water-body-labels']), { timeout: 30000 }).toContain('Mulshi Lake');
  await page.screenshot({ path: `test-results/water-lakes-${test.info().project.name}.png` });
  await page.evaluate(() => window.__atlas.map.raw.jumpTo({ center: [73.52, 17.54], zoom: 12 }));
  await expect.poll(() => renderedNames(page, ['waterway-labels']), { timeout: 30000 }).toContain('Vashishti');
  for (const theme of themes) {
    const colors = await page.evaluate(() => {
      const map = window.__atlas.map.raw;
      return ['water-body-labels', 'water-point-labels', 'waterway-labels', 'coastal-sea-label']
        .map(layer => map.getPaintProperty(layer, 'text-color'));
    });
    expect(colors).toEqual([theme.ink, theme.ink, theme.ink, theme.ink]);
    await expect.poll(() => renderedNames(page, ['waterway-labels'])).toContain('Vashishti');
  }
  expect(errors).toEqual([]);
  await page.screenshot({ path: `test-results/water-rivers-${test.info().project.name}.png` });
});
