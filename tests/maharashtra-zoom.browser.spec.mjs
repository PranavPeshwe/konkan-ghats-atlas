import { test, expect } from '@playwright/test';
import { createExpression } from '@maplibre/maplibre-gl-style-spec';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import reference from '../data/maharashtra-map-names.json' with { type: 'json' };
import { mapName, setMapNameReference } from '../src/map-names.js';
import { dismissWelcome } from './browser-helpers.mjs';
import { readFile } from 'node:fs/promises';

setMapNameReference(reference.records);
const url = pathToFileURL(path.resolve(process.env.ATLAS_HTML_PATH || 'pune_to_konkan.html')).href;
const expressionCache = new Map();
async function checkLabels(page, language) {
  const layers = await page.evaluate(() => {
    const map = window.__atlas.map.raw;
    return map.getStyle().layers.filter(layer => layer.type === 'symbol' && layer.source === 'basemap').map(layer => {
      const expression = map.getLayoutProperty(layer.id, 'text-field');
      const required = new Set(['name', 'name:en', 'name_en', 'name:latin', 'name_int', 'name:mr', 'name:hi', 'name_mr', 'name_hi', 'name:nonlatin']);
      const inspect = value => {
        if (!Array.isArray(value)) return;
        if (value[0] === 'get' && typeof value[1] === 'string') required.add(value[1]);
        for (const child of value) inspect(child);
      };
      inspect(expression);
      return {
        id: layer.id, expression, zoom: map.getZoom(),
        features: map.queryRenderedFeatures({ layers: [layer.id] }).map(feature => ({
          id: feature.id,
          properties: Object.fromEntries(Object.entries(feature.properties).filter(([key]) => required.has(key)))
        }))
      };
    });
  });
  let count = 0;
  const names = [], errors = [];
  for (const layer of layers) {
    const key = JSON.stringify(layer.expression);
    if (!expressionCache.has(key)) expressionCache.set(key, createExpression(layer.expression, `layers.${layer.id}.layout.text-field`));
    const compiled = expressionCache.get(key);
    expect(compiled.result).toBe('success');
    for (const feature of layer.features) {
      const actual = compiled.value.evaluate({ zoom: layer.zoom }, feature);
      const expected = mapName(feature.properties, language, feature);
      if (actual !== expected) errors.push({ layer: layer.id, id: feature.id, expected, actual });
      if (language !== 'en' && /^[≈~]/u.test(actual)) errors.push({ layer: layer.id, generatedSpelling: actual });
      names.push(actual); count++;
    }
  }
  return { errors, names, count };
}

test('Maharashtra names remain correct at every integer and half zoom, with other-state routes preserved', async ({ page }) => {
  test.setTimeout(600000);
  expressionCache.clear();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(url);
  await dismissWelcome(page);
  await expect.poll(() => page.evaluate(() => window.__atlas?.map.raw?.loaded()), { timeout: 45000 }).toBe(true);
  const limits = await page.evaluate(() => ({
    min: window.__atlas.map.raw.getMinZoom(), max: window.__atlas.map.raw.getMaxZoom(),
    constrained: Boolean(window.__atlas.map.raw.getMaxBounds()),
    goa: window.__atlas.atlas.beaches.some(beach => beach.id === 'palolem')
  }));
  expect(limits).toEqual({ min: 5, max: 16, constrained: false, goa: true });
  let occurrences = 0;
  for (const language of ['mr', 'hi', 'en']) {
    await page.locator('#language-select').selectOption(language);
    for (let zoom = 5; zoom <= 16; zoom += 0.5) {
      await page.evaluate(zoom => window.__atlas.map.raw.jumpTo({ center: [73.48, 18.48], zoom }), zoom);
      await expect.poll(() => page.evaluate(() => window.__atlas.map.raw.areTilesLoaded()), { timeout: 30000 }).toBe(true);
      await expect.poll(async () => (await checkLabels(page, language)).errors, { timeout: 15000 }).toEqual([]);
      occurrences += (await checkLabels(page, language)).count;
    }
    for (const view of [
      { center: [79.09, 21.15], name: language === 'mr' ? 'नागपूर' : language === 'hi' ? 'नागपुर' : 'Nagpur' },
      { center: [77.75, 20.93], name: language === 'en' ? 'Amravati' : 'अमरावती' },
      { center: [72.87, 19.055], name: language === 'en' ? 'Mumbai' : 'मुंबई' }
    ]) {
      await page.evaluate(view => window.__atlas.map.raw.jumpTo({ center: view.center, zoom: 10 }), view);
      await expect.poll(async () => (await checkLabels(page, language)).names, { timeout: 30000 }).toContain(view.name);
      expect((await checkLabels(page, language)).errors).toEqual([]);
    }
  }
  expect(occurrences).toBeGreaterThan(100);
  expect(pageErrors).toEqual([]);
});

test('Maharashtra map-name references remain downloadable offline in every language', async ({ page }) => {
  await page.route('https://**/*', route => route.abort());
  await page.goto(url);
  await dismissWelcome(page);
  for (const language of ['en', 'mr', 'hi']) {
    await page.locator('#language-select').selectOption(language);
    await page.locator('#about-button').click();
    const pending = page.waitForEvent('download');
    await page.locator('[data-download="map-names"]').click();
    const download = await pending;
    expect(download.suggestedFilename()).toBe('konkan-maharashtra-map-names.json');
    const saved = JSON.parse(await readFile(await download.path(), 'utf8'));
    expect(saved.records).toEqual(reference.records);
    await page.locator('#close-about').click();
  }
});
