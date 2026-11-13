import { test, expect } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { mkdir, mkdtemp, copyFile, unlink, rmdir } from 'node:fs/promises';
import { themes } from '../src/themes.js';
import { dismissWelcome } from './browser-helpers.mjs';

const htmlPath = path.resolve(process.env.ATLAS_HTML_PATH || 'pune_to_konkan.html');
const url = pathToFileURL(htmlPath).href;
test('direct-file map embeds app and worker without runtime CDN dependencies', async ({ page }) => {
  const errors = [];
  const requests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'warning' || message.type() === 'error') console.log(message.text()); });
  page.on('requestfailed', request => console.log('Request failed:', request.url(), request.failure()?.errorText));
  page.on('request', request => requests.push(request.url()));
  await page.goto(url);
  await dismissWelcome(page);
  await expect(page.locator('.maplibregl-canvas')).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const map = window.__atlas?.map.raw;
    return map?.loaded() && map.queryRenderedFeatures({ layers: ['atlas-place-circles'] }).length > 0;
  }), { timeout: 45000 }).toBe(true);
  await expect(page.locator('#map-fallback')).toBeHidden();
  expect(errors).toEqual([]);
  expect(requests.filter(r => /^https?:/.test(r)).every(r => new URL(r).hostname === 'tiles.openfreemap.org')).toBe(true);
  await page.screenshot({ path: `test-results/map-${test.info().project.name}.png` });
  await page.locator('[data-entity="tamhini"]').click();
  await page.locator('#route-list [data-select]').nth(0).check();
  await page.locator('#route-list [data-select]').nth(1).check();
  const routeCount = () => page.evaluate(() => window.__atlas.map.raw.getStyle().sources['atlas-routes'].data.features.length);
  await expect.poll(routeCount).toBe(2);
  await page.locator('#route-list [data-fit]').first().click();
  await expect.poll(routeCount).toBe(1);
  await page.locator('#selected-only').click();
  await expect.poll(routeCount).toBe(2);
  await page.locator('#reset-view').click();
  await expect.poll(routeCount).toBe(2);
  for (const theme of themes) {
    await expect.poll(() => page.evaluate(() => window.__atlas.map.raw.loaded() && !window.__atlas.map.raw.isMoving())).toBe(true);
    await page.screenshot({ path: `test-results/preview-${theme.id}-${test.info().project.name}.png` });
  }
});

async function openLocally(page, expectTileFailure = true) {
  page.on('pageerror', error => console.log('Page error:', error.message));
  await page.route('https://**/*', route => route.abort());
  await page.goto(url);
  await dismissWelcome(page);
  await expect(page.locator('#catalog-list .catalog-item').first()).toBeVisible();
  if (expectTileFailure) await expect(page.locator('#map-status')).toContainText('Basemap tiles unavailable', { timeout: 20000 });
}

test('Raghuvir is absent from the catalogue, search and map after removal', async ({ page }) => {
  await openLocally(page);
  await expect(page.locator('[data-entity="raghuvir"]')).toHaveCount(0);
  await page.locator('#search').fill('Raghuvir');
  await expect(page.locator('#search-results .search-result')).toHaveCount(0);
  await expect(page.locator('#route-list .route-card')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.__atlas.map.ready)).toBe(true);
  const references = await page.evaluate(() => {
    const sources = window.__atlas.map.raw.getStyle().sources;
    return ['atlas-routes', 'atlas-places', 'atlas-waypoints']
      .flatMap(id => sources[id].data.features)
      .filter(feature => /raghuv(?:ee|i)r/i.test(JSON.stringify(feature.properties))).length;
  });
  expect(references).toBe(0);
});

test('usage guide is visible above the atlas without the removed section index', async ({ page }) => {
  await openLocally(page);
  await expect(page.getByRole('region', { name: 'How to use' })).toBeVisible();
  await expect(page.locator('.quick-guide')).toContainText('Trace on map');
  await expect(page.locator('.quick-guide')).toContainText('Compare');
  await expect(page.locator('#heading-index, .catalog-bottom')).toHaveCount(0);
  const guide = await page.locator('.quick-guide').boundingBox();
  const workspace = await page.locator('#workspace').boundingBox();
  expect(guide.y + guide.height).toBeLessThanOrEqual(workspace.y + 1);
  await page.screenshot({ path: `test-results/usage-guide-${test.info().project.name}.png` });
});

test('Ocean panels, map and route colours agree without resetting the journey', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openLocally(page);
  await expect(page.locator('#theme-select')).toHaveCount(0);
  await page.locator('[data-entity="tamhini"]').click();
  await page.locator('#route-list [data-select]').nth(0).check();
  await page.locator('#route-list [data-select]').nth(1).check();
  await expect.poll(() => page.evaluate(() => window.__atlas?.map.ready)).toBe(true);
  const before = await page.evaluate(() => {
    window.__mapBeforeTheme = window.__atlas.map.raw;
    return {
      focus: window.__atlas.store.state.focus,
      selected: [...window.__atlas.store.state.selectedIds],
      filters: window.__atlas.store.state.filters,
      weights: window.__atlas.store.state.weights,
      query: window.__atlas.store.state.query,
      zoom: window.__atlas.map.raw.getZoom()
    };
  });
  const surfaces = new Set();
  for (const theme of themes) {
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme.id);
    await expect(page.locator('html')).toHaveAttribute('data-color-mode', theme.mode);
    const actual = await page.evaluate(() => {
      const map = window.__atlas.map.raw;
      const line = map.getStyle().sources['atlas-routes'].data.features[0];
      const card = document.querySelector(`[data-route-card="${line.properties.id}"]`);
      return {
        focus: window.__atlas.store.state.focus,
        selected: [...window.__atlas.store.state.selectedIds],
        filters: window.__atlas.store.state.filters,
        weights: window.__atlas.store.state.weights,
        query: window.__atlas.store.state.query,
        zoom: map.getZoom(), sameMap: map === window.__mapBeforeTheme,
        water: map.getPaintProperty('water', 'fill-color'),
        land: map.getPaintProperty('land', 'background-color'),
        background: getComputedStyle(document.body).backgroundColor,
        line: line.properties.color,
        card: getComputedStyle(card).getPropertyValue('--route-color').trim()
      };
    });
    expect(actual.focus).toEqual(before.focus);
    expect(actual.selected).toEqual(before.selected);
    expect(actual.filters).toEqual(before.filters);
    expect(actual.weights).toEqual(before.weights);
    expect(actual.query).toEqual(before.query);
    expect(actual.zoom).toBeCloseTo(before.zoom);
    expect(actual.sameMap).toBe(true);
    expect(actual.water).toBe(theme.water);
    expect(actual.land).toBe(theme.land);
    expect(actual.line).toBe(actual.card);
    surfaces.add(actual.background);
    await expect.poll(() => page.evaluate(() => window.__atlas.map.raw.loaded() && !window.__atlas.map.raw.isMoving())).toBe(true);
    await page.screenshot({ path: `test-results/theme-${theme.id}-${test.info().project.name}.png` });
  }
  expect(surfaces.size).toBe(themes.length);
});

test('obsolete theme preferences cannot override Ocean and blocked storage does not break startup', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('pune-konkan-theme', 'orchid'));
  await openLocally(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'ocean');
  expect(await page.evaluate(() => localStorage.getItem('pune-konkan-theme'))).toBeNull();
  await page.reload();
  await dismissWelcome(page);
  await expect(page.locator('#theme-select')).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'ocean');
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() { throw new DOMException('Storage unavailable', 'SecurityError'); }
    });
  });
  await page.reload();
  await dismissWelcome(page);
  await expect(page.locator('#theme-select')).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'ocean');
  await expect(page.locator('#catalog-list .catalog-item').first()).toBeVisible();
});

test('ghat discovery, same-beach comparison, custom weights and retained filtered selections', async ({ page }) => {
  await openLocally(page);
  await page.locator('[data-entity="tamhini"]').click();
  await expect(page.locator('#detail-tamhini')).toHaveText('Tamhini Ghat');
  await expect(page.locator('[data-route-card]').first()).toBeVisible();
  await page.locator('#search').fill('Diveagar');
  await page.locator('[data-result="diveagar"][data-kind="beaches"]').click();
  const checkboxes = page.locator('#route-list [data-select]');
  expect(await checkboxes.count()).toBeGreaterThanOrEqual(2);
  await checkboxes.nth(0).check();
  await checkboxes.nth(1).check();
  await page.locator('#compare-button').click();
  await expect(page.locator('#comparison')).toBeVisible();
  await expect(page.locator('.comparison-table tbody tr')).toHaveCount(5);
  await page.locator('#available-weights').click();
  await expect(page.locator('.comparison-table .score')).toHaveCount(5);
  await page.getByRole('slider', { name: 'Scenery weight' }).focus();
  await page.keyboard.press('End');
  await expect(page.getByRole('slider', { name: 'Scenery weight' })).toHaveValue('10');
  await page.locator('#close-comparison').click();
  await page.locator('#max-distance').fill('0');
  await expect(page.locator('.route-card.filtered')).toHaveCount(5);
  await expect(page.locator('#selection-count')).toHaveText('5');
  await page.locator('[data-reveal]').first().click();
  await expect(page.locator('#max-distance')).toHaveValue('');
  await expect(page.locator('.route-card.filtered')).toHaveCount(0);
});

test('alias search, disclosure controls and About remain usable without a heading index', async ({ page }) => {
  await openLocally(page);
  await page.locator('#search').fill('Tamini');
  await expect(page.locator('[data-result="tamhini"]')).toHaveCount(1);
  await page.locator('[data-result="tamhini"]').click();
  await page.locator('#season-tamhini').locator('..').locator(':scope > summary').click();
  await expect(page.locator('#season-tamhini')).toBeVisible();
  await page.locator('#about-button').click();
  await expect(page.locator('#about-dialog')).toBeVisible();
  await page.locator('#close-about').click();
  await expect(page.locator('#heading-index')).toHaveCount(0);
});

test('moving only the HTML preserves local functions and embedded data downloads', async ({ page }) => {
  await mkdir('.cache', { recursive: true });
  const directory = await mkdtemp(path.resolve('.cache', 'standalone-'));
  const moved = path.join(directory, 'atlas.html');
  await copyFile(htmlPath, moved);
  try {
    await page.route('https://**/*', route => route.abort());
    await page.goto(pathToFileURL(moved).href);
    await dismissWelcome(page);
    await expect(page.locator('#catalog-list .catalog-item').first()).toBeVisible();
    await page.locator('#about-button').click();
    const pending = page.waitForEvent('download');
    await page.locator('[data-download="data"]').click();
    const download = await pending;
    expect(download.suggestedFilename()).toBe('konkan-atlas-data.json');
    expect(await download.failure()).toBeNull();
  } finally {
    await page.close();
    await unlink(moved);
    await rmdir(directory);
  }
});

test('map rendering failure retains usable catalog, details and search', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, options) {
      return String(type).includes('webgl') ? null : original.call(this, type, options);
    };
  });
  await openLocally(page, false);
  await expect(page.locator('#map-fallback')).toBeVisible();
  await page.locator('[data-entity="tamhini"]').click();
  await expect(page.locator('#detail-tamhini')).toBeVisible();
  await page.locator('#search').fill('Palolem');
  await expect(page.locator('[data-result="palolem"]')).toBeVisible();
});

test('desktop viewport and page zoom retain scrollable controls and section links', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await openLocally(page);
  await expect(page.locator('#search')).toBeVisible();
  await expect(page.locator('#heading-index')).toHaveCount(0);
  await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
  const canScroll = await page.evaluate(() => ({
    catalog: document.querySelector('#catalog-list').scrollHeight > document.querySelector('#catalog-list').clientHeight,
    inspector: document.querySelector('.inspector').scrollHeight > document.querySelector('.inspector').clientHeight
  }));
  expect(canScroll.catalog).toBe(true);
  expect(canScroll.inspector).toBe(true);
});

test('full-catalog search and preference updates stay interactive', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await openLocally(page);
  const measurements = await page.evaluate(() => {
    const times = [];
    for (const query of ['a', 'ghat', 'Goa', 'Tamhini', '']) {
      const start = performance.now();
      window.__atlas.store.dispatch({ type: 'query', value: query });
      times.push(performance.now() - start);
    }
    return times;
  });
  if (process.env.ATLAS_HTML_PATH) console.log('Search dispatch times (ms):', measurements);
  expect(Math.max(...measurements)).toBeLessThan(100);
  await page.locator('[data-entity="tamhini"]').click();
  await page.locator('#route-list [data-select]').nth(0).check();
  await page.locator('#route-list [data-select]').nth(1).check();
  await page.locator('#compare-button').click();
  await page.locator('#available-weights').click();
  await page.screenshot({ path: `test-results/comparison-${test.info().project.name}.png` });
});

test('every ghat shows its ten nearest catalogued beaches, shortest first', async ({ page }) => {
  await openLocally(page);
  const ghats = await page.evaluate(() => window.__atlas.atlas.ghats.map(ghat => ({
    id: ghat.id, nearest: ghat.nearestBeachIds
  })));
  for (const ghat of ghats) {
    await page.locator(`[data-entity="${ghat.id}"]`).click();
    const cards = page.locator('#route-list .route-card[data-current="true"]');
    await expect(cards).toHaveCount(ghat.id === 'bor' ? 30 : 10);
    const actual = await cards.evaluateAll(elements => elements.map(element => ({
      beach: element.dataset.beach, distance: Number(element.dataset.distance), alignment: element.dataset.alignment,
      color: getComputedStyle(element).getPropertyValue('--route-color').trim()
    })));
    expect(new Set(actual.map(item => item.beach)).size).toBe(10);
    expect(actual.map(item => item.distance)).toEqual([...actual.map(item => item.distance)].sort((a, b) => a - b));
    expect(actual.map(item => item.beach).sort()).toEqual(ghat.nearest.flatMap(id => ghat.id === 'bor' ? [id, id, id] : [id]).sort());
    if (ghat.id === 'bor') {
      expect(new Set(actual.filter(item => item.alignment === 'old-highway').map(item => item.color)).size).toBe(10);
      for (const beach of ghat.nearest) expect(new Set(actual.filter(item => item.beach === beach).map(item => item.color)).size).toBe(3);
    } else expect(new Set(actual.map(item => item.color)).size).toBe(10);
    await expect(page.locator('#route-order-note')).toContainText('shortest first');
  }
});

test('every beach automatically selects five shortest distinct ghat routes with complete Google links', async ({ page }) => {
  await openLocally(page);
  const beaches = await page.evaluate(() => window.__atlas.atlas.beaches.map(beach => {
    const choices = new Map();
    const routes = window.__atlas.atlas.routes.filter(route => route.beachId === beach.id)
      .sort((a, b) => a.distanceKm - b.distanceKm || a.id.localeCompare(b.id));
    for (const route of routes) {
      const ghat = route.primaryGhatId || route.ghatIds.find(id => route.id === `${id}-${route.beachId}`) || route.ghatIds.at(-1);
      if (!choices.has(ghat)) choices.set(ghat, route.id);
    }
    const expected = [...choices.values()].slice(0, 5);
    const hasBor = expected.some(id => routes.find(route => route.id === id).ghatIds.includes('bor'));
    return { id: beach.id, expected, expectedCards: routes.filter(route => expected.includes(route.id) || hasBor && route.ghatIds.includes('bor')).map(route => route.id) };
  }));
  expect(beaches.length).toBeGreaterThanOrEqual(35);
  await page.locator('[data-mode="beaches"]').click();
  for (const beach of beaches) {
    await page.locator(`[data-entity="${beach.id}"]`).click();
    await expect(page.locator('#selection-count')).toHaveText('5');
    await expect(page.locator('#route-list [data-select]:checked')).toHaveCount(5);
    const actual = await page.evaluate(() => ({
      selected: [...window.__atlas.store.state.selectedIds],
      cards: [...document.querySelectorAll('#route-list .route-card')].map(card => ({
        id: card.dataset.routeCard, distance: Number(card.dataset.distance),
        href: card.querySelector('[data-google-route]').href,
        target: card.querySelector('[data-google-route]').target,
        rel: card.querySelector('[data-google-route]').rel
      }))
    }));
    expect(actual.selected).toEqual(beach.expected);
    expect(actual.cards.map(card => card.id)).toEqual(beach.expectedCards);
    expect(actual.cards.map(card => card.distance)).toEqual([...actual.cards.map(card => card.distance)].sort((a, b) => a - b));
    for (const card of actual.cards) {
      const link = new URL(card.href);
      expect(link.hostname).toBe('maps.google.com');
      expect(link.searchParams.get('api')).toBe('1');
      expect(link.searchParams.get('origin')).toBeTruthy();
      expect(link.searchParams.get('destination')).toBeTruthy();
      expect(link.searchParams.get('waypoints')).toBeTruthy();
      expect(card.target).toBe('_blank');
      expect(card.rel).toContain('noopener');
      expect(card.rel).toContain('noreferrer');
    }
  }
  await page.context().route('https://maps.google.com/**', route => route.fulfill({ body: 'Directions opened' }));
  const link = page.locator('#route-list [data-google-route]').first();
  const href = await link.getAttribute('href');
  const opened = page.waitForEvent('popup');
  await link.click();
  const popup = await opened;
  await expect(popup).toHaveURL(href);
  await popup.close();
});

test('on-map Reset all restores every application default and retains Ocean', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openLocally(page);
  await expect.poll(() => page.evaluate(() => window.__atlas.map.ready)).toBe(true);
  const snapshot = () => page.evaluate(() => {
    const state = window.__atlas.store.state;
    return { ...state, selectedIds: [...state.selectedIds] };
  });
  const defaults = await snapshot();
  const camera = await page.evaluate(() => ({
    center: window.__atlas.map.raw.getCenter().toArray(), zoom: window.__atlas.map.raw.getZoom()
  }));
  const weightNote = await page.locator('#weight-note').textContent();
  await page.locator('[data-mode="beaches"]').click();
  await page.locator('[data-entity="diveagar"]').click();
  await page.locator('#route-list [data-fit]').first().click();
  await page.locator('#compare-button').click();
  await page.locator('#available-weights').click();
  await page.getByRole('slider', { name: 'Scenery weight' }).focus();
  await page.keyboard.press('End');
  await page.locator('#close-comparison').click();
  await page.locator('#max-distance').fill('0');
  await page.locator('#max-time').fill('1');
  await page.locator('#difficulty').selectOption('2');
  await page.locator('#scenery').selectOption('5');
  await page.locator('#search').fill('Goa');
  await page.evaluate(() => {
    window.__atlas.map.raw.jumpTo({ center: [73.3, 17.4], zoom: 9, bearing: 25, pitch: 30 });
    history.replaceState(null, '', '#usage-heading');
  });
  await expect(page.getByRole('button', { name: 'Reset all settings' })).toBeVisible();
  await page.getByRole('button', { name: 'Reset all settings' }).click();
  expect(await snapshot()).toEqual(defaults);
  await expect(page.locator('#theme-select')).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'ocean');
  await expect(page.locator('#weight-note')).toHaveText(weightNote);
  await expect(page.locator('#comparison')).toBeHidden();
  await expect(page.locator('#selected-only')).toBeDisabled();
  for (const id of ['search', 'max-distance', 'max-time', 'difficulty', 'scenery']) await expect(page.locator(`#${id}`)).toHaveValue('');
  expect(await page.locator('[data-weight]').evaluateAll(inputs => inputs.map(input => Number(input.value)))).toEqual([5, 5, 5, 5]);
  const reset = await page.evaluate(() => ({
    center: window.__atlas.map.raw.getCenter().toArray(), zoom: window.__atlas.map.raw.getZoom(),
    bearing: window.__atlas.map.raw.getBearing(), pitch: window.__atlas.map.raw.getPitch(),
    savedTheme: localStorage.getItem('pune-konkan-theme'), hash: location.hash,
    popupCount: document.querySelectorAll('.maplibregl-popup').length
  }));
  expect(reset.zoom).toBeCloseTo(camera.zoom);
  expect(reset.center[0]).toBeCloseTo(camera.center[0]);
  expect(reset.center[1]).toBeCloseTo(camera.center[1]);
  expect(reset.bearing).toBe(0);
  expect(reset.pitch).toBe(0);
  expect(reset.savedTheme).toBeNull();
  expect(reset.hash).toBe('');
  expect(reset.popupCount).toBe(0);
  await page.reload();
  await dismissWelcome(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'ocean');
});

test('route cards, map lines, beach markers and legend share their colour coding', async ({ page }) => {
  await openLocally(page);
  await page.locator('[data-entity="tamhini"]').click();
  await expect.poll(() => page.evaluate(() => window.__atlas.map.ready)).toBe(true);
  const colors = await page.evaluate(() => {
    const sources = window.__atlas.map.raw.getStyle().sources;
    const lines = sources['atlas-routes'].data.features;
    const markers = sources['atlas-places'].data.features;
    return [...document.querySelectorAll('#route-list .route-card[data-current="true"]')].map(card => {
      const color = getComputedStyle(card).getPropertyValue('--route-color').trim();
      const legend = document.querySelector(`#map-legend [data-fit="${card.dataset.routeCard}"]`);
      return {
        color, line: lines.find(line => line.properties.id === card.dataset.routeCard).properties.color,
        marker: markers.find(marker => marker.properties.id === card.dataset.beach).properties.color,
        legend: getComputedStyle(legend).getPropertyValue('--route-color').trim()
      };
    });
  });
  for (const item of colors) {
    expect(item.line).toBe(item.color);
    expect(item.marker).toBe(item.color);
    expect(item.legend).toBe(item.color);
  }
});
