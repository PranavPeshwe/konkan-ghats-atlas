import { test, expect } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { themes } from '../src/themes.js';
import { dismissWelcome } from './browser-helpers.mjs';
import { readFile } from 'node:fs/promises';

const url = pathToFileURL(path.resolve('pune_to_konkan.html')).href;
async function open(page, online = false) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  if (!online) await page.route('https://**/*', route => route.abort());
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(url);
  await dismissWelcome(page);
  await expect(page.locator('#catalog-list .catalog-item').first()).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__atlas?.map.ready)).toBe(true);
  return errors;
}

test('direct, highway and composed routes expose reconciled stage distances and model times offline', async ({ page }) => {
  const errors = await open(page);
  const routes = await page.evaluate(() => [
    window.__atlas.atlas.routes.find(route => route.kind === 'ghat' && !route.provenance.coverageExpansion?.composition),
    window.__atlas.atlas.routes.find(route => route.kind === 'highway'),
    window.__atlas.atlas.routes.find(route => route.provenance.coverageExpansion?.composition)
  ].map(route => ({ id: route.id, name: route.name, stages: window.__atlas.fieldGuide.routes[route.id].stages })));
  await expect(page.locator('[data-journey]')).toHaveCount(0);
  for (const route of routes) {
    await page.locator('#search').fill(route.name);
    await page.locator(`[data-result="${route.id}"][data-kind="routes"]`).click();
    const details = page.locator(`[data-journey="${route.id}"]`);
    await details.locator('summary').click();
    await expect(details.locator('[data-stage]')).toHaveCount(3);
    const actual = await details.locator('[data-stage]').evaluateAll(items => items.map(item => ({
      id: item.dataset.stage, distanceM: Number(item.dataset.metres), durationSeconds: Number(item.dataset.seconds)
    })));
    expect(actual).toEqual(route.stages.map(({ id, distanceM, durationSeconds }) => ({ id, distanceM, durationSeconds })));
    await expect(details).toContainText('traffic and stops excluded');
  }
  const card = page.locator(`[data-route-card="${routes.at(-1).id}"]`);
  await card.locator('[data-select]').uncheck();
  await card.locator('[data-select]').check();
  await expect(page.locator(`[data-journey="${routes.at(-1).id}"]`)).toHaveAttribute('open', '');
  const pending = page.waitForEvent('download');
  await page.locator(`[data-journey-evidence="${routes[0].id}"]`).click();
  const evidence = await pending;
  expect(evidence.suggestedFilename()).toBe(`${routes[0].id}-journey-evidence.json`);
  expect(await evidence.failure()).toBeNull();
  expect(errors).toEqual([]);
});

test('every ghat has a map-linked profile with keyboard exploration and a precise section highlight', async ({ page }) => {
  const errors = await open(page);
  const ghats = await page.evaluate(() => window.__atlas.atlas.ghats.map(ghat => ghat.id));
  for (const id of ghats) {
    await page.locator(`[data-entity="${id}"]`).click();
    if (id === 'bor') await page.locator('[data-bor-alignment="old-highway"]').click();
    const slider = page.locator(`[data-profile-slider="${id}"]`);
    await expect(slider).toBeVisible();
    await expect(page.locator('[data-measurement-audit]')).toContainText('Current exact whole-ghat length: not independently established');
    await expect(page.locator('.ghat-profile')).toContainText('Not a verified whole-ghat profile');
    await expect(page.locator('.profile-comparison')).toHaveCount(2);
    await slider.focus();
    await page.keyboard.press('End');
    const state = await page.evaluate(id => {
      const { map, fieldGuide, store } = window.__atlas;
      const profile = fieldGuide.ghats[id].elevation;
      const sources = map.raw.getStyle().sources;
      return {
        profile, highlight: sources['atlas-ghat-section'].data.features[0],
        point: sources['atlas-elevation-cursor'].data.features[0],
        selected: [...store.state.selectedIds]
      };
    }, id);
    expect(state.highlight.geometry).toEqual(state.profile.geometry);
    expect(state.highlight.properties.ghatId).toBe(id);
    expect(state.point.properties.index).toBe(state.profile.samples.length - 1);
    expect(state.point.geometry.coordinates).toEqual(state.profile.samples.at(-1).coordinates);
    expect(state.point.properties.elevationM).toBe(state.profile.samples.at(-1).elevationM);
    expect(state.selected).toEqual([]);
    await expect(page.locator('[data-profile-readout]')).toContainText(`${Math.round(state.profile.samples.at(-1).elevationM)} m`);
  }
  const svg = page.locator('[data-profile-chart]');
  await svg.scrollIntoViewIfNeeded();
  const box = await svg.boundingBox();
  await page.mouse.move(box.x + box.width * 0.53, box.y + box.height * 0.5);
  const pointer = await page.evaluate(() => window.__atlas.map.raw.getStyle().sources['atlas-elevation-cursor'].data.features[0].properties);
  expect(pointer.index).toBeGreaterThan(0);
  expect(pointer.index).toBeLessThan(await page.locator('[data-profile-slider]').getAttribute('max').then(Number));
  await page.locator('#reset-all').click();
  await expect(page.locator('[data-profile-chart]')).toHaveCount(0);
  expect(await page.evaluate(() => ['atlas-ghat-section', 'atlas-elevation-cursor']
    .map(id => window.__atlas.map.raw.getStyle().sources[id].data.features.length))).toEqual([0, 0]);
  expect(errors).toEqual([]);
});

test('ghat-only references remain distinct from model, project and historical lengths in the UI and downloads', async ({ page }) => {
  const errors = await open(page);
  await page.locator('[data-entity="karul"]').click();
  await expect(page.locator('.detail-stats')).toContainText('10 km');
  await expect(page.locator('.detail-stats')).toContainText('published ghat-only estimate');
  await expect(page.locator('.detail-stats')).not.toContainText('entry terrain');
  await page.locator('#measurement-sources-karul').locator('..').locator(':scope > summary').click();
  await expect(page.locator('[data-measurement-scope="approximate-ghat-road"]')).toContainText('10.0 km');
  await expect(page.locator('[data-measurement-scope="ghat-plus-town-project-segment"]')).toContainText('16.0 km');
  await page.locator('[data-entity="bor"]').click();
  await page.locator('#measurement-sources-bor').locator('..').locator(':scope > summary').click();
  await expect(page.locator('[data-measurement-audit]')).toContainText('13.8 km / 23.0 km');
  await page.locator('[data-entity="varandha"]').click();
  await expect(page.locator('.detail-stats')).toContainText('18 km');
  await expect(page.locator('.ghat-profile')).toContainText('108 m');
  await page.locator('#elevation-evidence-varandha').locator('..').locator(':scope > summary').click();
  const pending = page.waitForEvent('download');
  await page.locator('[data-profile-evidence="varandha"]').click();
  const download = await pending;
  const evidence = JSON.parse(await readFile(await download.path(), 'utf8'));
  expect(evidence.audit.actualGhatLengthM).toBeNull();
  expect(evidence.audit.sourceRecords.aster.response.results.length).toBe(evidence.profile.samples.length);
  expect(evidence.audit.sourceRecords.copernicus.response.elevation.length).toBe(evidence.profile.samples.length);
  expect(evidence.sources.some(source => source.id === 'audit-malshej-risk')).toBe(true);
  expect(evidence.sources.some(source => source.id === 'guide-satara-roads')).toBe(true);
  await expect(page.locator('[data-profile-readout]')).toContainText('SRTM');
  await expect(page.locator('[data-profile-readout]')).toContainText('ASTER');
  await expect(page.locator('[data-profile-readout]')).toContainText('Copernicus');
  expect(errors).toEqual([]);
});

test('sourced stories distinguish unknowns and traditions; profile theme, navigation and evidence remain usable', async ({ page }) => {
  const errors = await open(page);
  await page.locator('[data-entity="ambenali"]').click();
  await page.locator('#stories-ambenali').locator('..').locator(':scope > summary').click();
  await expect(page.locator('#stories-ambenali')).toBeVisible();
  await expect(page.locator('[data-claim="forts"]')).toContainText('historic Par pass');
  await expect(page.locator('[data-claim="legends"]')).toContainText('Recorded tradition');
  await expect(page.locator('[data-claim="legends"] a')).toHaveAttribute('href', 'https://maharashtratourism.gov.in/fort/pratapgad/');
  await expect(page.locator('[data-claim="nameMeaning"]')).toHaveAttribute('data-evidence', 'unknown');
  await page.locator('#elevation-evidence-ambenali').locator('..').locator(':scope > summary').click();
  await expect(page.locator('#elevation-evidence-ambenali')).toBeVisible();
  await expect(page.locator('.profile-evidence')).toContainText('not surveyed road-deck height');
  const pending = page.waitForEvent('download');
  await page.locator('[data-profile-evidence="ambenali"]').click();
  const evidence = await pending;
  expect(evidence.suggestedFilename()).toBe('ambenali-elevation-evidence.json');
  expect(await evidence.failure()).toBeNull();
  for (const theme of themes) {
    const paint = await page.evaluate(() => ({
      line: window.__atlas.map.raw.getPaintProperty('ghat-section-line', 'line-color'),
      point: window.__atlas.map.raw.getPaintProperty('elevation-cursor', 'circle-color')
    }));
    expect(paint).toEqual({ line: theme.secondary, point: theme.secondary });
  }
  await expect(page.locator('#heading-index')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('new field-guide panels remain visually legible beside the online map', async ({ page }) => {
  const errors = await open(page, true);
  await page.locator('[data-entity="tamhini"]').click();
  await page.locator('[data-fit-profile="tamhini"]').click();
  await expect.poll(() => page.evaluate(() => window.__atlas.map.raw.loaded()), { timeout: 45000 }).toBe(true);
  await page.locator('.ghat-profile').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `test-results/field-guide-elevation-${test.info().project.name}.png` });
  await page.locator('#route-list [data-journey] summary').first().click();
  await page.locator('#route-list [data-journey]').first().scrollIntoViewIfNeeded();
  await expect(page.locator('#route-list [data-journey]').first().locator('[data-stage]')).toHaveCount(3);
  await page.screenshot({ path: `test-results/field-guide-journey-${test.info().project.name}.png` });
  expect(errors).toEqual([]);
});
