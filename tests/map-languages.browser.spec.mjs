import { test, expect } from '@playwright/test';
import { createExpression } from '@maplibre/maplibre-gl-style-spec';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { dismissWelcome } from './browser-helpers.mjs';
import { featureName, mapName, setMapNameReference } from '../src/map-names.js';
import reference from '../data/maharashtra-map-names.json' with { type: 'json' };

setMapNameReference(reference.records);
const url = pathToFileURL(path.resolve('pune_to_konkan.html')).href;
async function labels(page, rendered = false) {
  const data = await page.evaluate(rendered => {
    const map = window.__atlas.map.raw;
    const layers = map.getStyle().layers.filter(layer => layer.type === 'symbol');
    return layers.map(layer => ({
      id: layer.id, source: layer.source, expression: map.getLayoutProperty(layer.id, 'text-field'),
      features: (rendered
        ? map.queryRenderedFeatures({ layers: [layer.id] })
        : map.querySourceFeatures(layer.source, { sourceLayer: layer['source-layer'] }))
        .map(feature => ({ id: feature.id, properties: feature.properties }))
    }));
  }, rendered);
  const language = await page.locator('html').getAttribute('lang');
  return data.map(layer => {
    const compiled = createExpression(layer.expression, `layers.${layer.id}.layout.text-field`);
    expect(compiled.result, `Invalid ${layer.id} label expression`).toBe('success');
    const features = layer.features.filter(feature => featureName(feature.properties).trim());
    const nameFor = feature => compiled.value.evaluate({ zoom: 10 }, feature);
    return {
      id: layer.id,
      names: features.map(nameFor),
      invalidNames: features.flatMap(feature => {
        const actual = nameFor(feature);
        const expected = layer.source === 'basemap' ? mapName(feature.properties, language, feature) : actual;
        return !actual || actual !== expected || (language !== 'en' && /^[≈~]/u.test(actual)) ? [{ actual, expected, id: feature.id }] : [];
      })
    };
  });
}

test('map names use native spellings or exact English fallback across settlements, water and newly loaded tiles', async ({ page }) => {
  test.setTimeout(180000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (/Basemap:.*(text-field|expression|layers\.)/i.test(message.text())) errors.push(message.text());
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(url);
  await dismissWelcome(page);
  await expect.poll(() => page.evaluate(() => window.__atlas?.map.raw?.loaded()), { timeout: 45000 }).toBe(true);
  await page.locator('[data-entity="tamhini"]').click();
  await page.locator('#route-list [data-select]').first().check();
  for (const language of ['mr', 'hi']) {
    await page.locator('#language-select').selectOption(language);
    for (const view of [
      { center: [73.48, 18.48], zoom: 10, layer: 'water-body-labels', name: language === 'mr' ? 'मुळशी जलाशय' : 'मुलशी झील' },
      { center: [73.52, 17.54], zoom: 12, layer: 'waterway-labels', name: 'वाशिष्ठी' },
      { center: [74.1, 15.7], zoom: 11 },
      { center: [72.9, 18.42], zoom: 9, layer: 'coastal-sea-label', name: language === 'mr' ? 'अरबी समुद्र' : 'अरब सागर' }
    ]) {
      await page.evaluate(({ center, zoom }) => window.__atlas.map.raw.jumpTo({ center, zoom }), view);
      await expect.poll(() => page.evaluate(() => window.__atlas.map.raw.areTilesLoaded()), { timeout: 30000 }).toBe(true);
      if (view.layer) await expect.poll(async () => (await labels(page, true)).find(layer => layer.id === view.layer)?.names, { timeout: 30000 }).toContain(view.name);
      await expect.poll(async () => {
        const layers = await labels(page);
        return layers.flatMap(layer => layer.invalidNames);
      }, { timeout: 30000 }).toEqual([]);
      expect((await labels(page, true)).find(layer => layer.id === 'settlement-labels').names.length).toBeGreaterThan(0);
      if (view.layer) await page.screenshot({ path: `test-results/map-language-${language}-${view.layer}-${test.info().project.name}.png` });
    }
    await page.screenshot({ path: `test-results/map-language-${language}-${test.info().project.name}.png` });
  }
  await page.locator('#language-select').selectOption('en');
  await page.evaluate(() => window.__atlas.map.raw.jumpTo({ center: [73.48, 18.48], zoom: 10 }));
  await expect.poll(async () => (await labels(page, true)).find(layer => layer.id === 'water-body-labels')?.names, { timeout: 30000 }).toContain('Mulshi Lake');
  const english = await labels(page);
  expect(english.flatMap(layer => layer.names).some(name => /\p{Script=Devanagari}|\p{Script=Kannada}/u.test(name))).toBe(false);
  expect(errors).toEqual([]);
});

test('fallback policy stays clear in every language and About no longer advertises guessed spellings', async ({ page }) => {
  await page.route('https://**/*', route => route.abort());
  await page.goto(url);
  await dismissWelcome(page);
  for (const [language, policy] of [['en', 'English fallback'], ['mr', 'नाव नसल्यास इंग्रजी'], ['hi', 'नाम न मिले तो अंग्रेज़ी']]) {
    await page.locator('#language-select').selectOption(language);
    await expect(page.locator('.map-footnote')).toContainText(policy);
    await expect(page.locator('.map-footnote')).not.toContainText('≈');
    await page.locator('#about-button').click();
    await expect(page.locator('#about-content')).not.toContainText('≈');
    await expect(page.locator('#about-content')).toContainText(language === 'en'
      ? 'Automatic phonetic spellings are not used.'
      : language === 'mr' ? 'स्वयंचलित ध्वन्यात्मक लिप्यंतर वापरलेले नाही.' : 'स्वचालित ध्वन्यात्मक लिप्यंतरण का उपयोग नहीं होता है।');
    await page.locator('#close-about').click();
  }
});
