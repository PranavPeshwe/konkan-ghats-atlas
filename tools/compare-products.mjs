import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [baselinePath, candidatePath, reportPath] = process.argv.slice(2).map(value => resolve(value));
if (!baselinePath || !candidatePath || !reportPath) throw new Error('Provide baseline HTML, candidate HTML and report JSON paths.');
const directory = dirname(reportPath);
await mkdir(directory, { recursive: true });
const hash = value => createHash('sha256').update(value).digest('hex');
async function imageDifference(browser, leftPath, rightPath) {
  const images = await Promise.all([leftPath, rightPath].map(async path => (await readFile(path)).toString('base64')));
  const page = await browser.newPage();
  try {
    return await page.evaluate(async images => {
      const decode = async text => {
        const bitmap = await createImageBitmap(new Blob([Uint8Array.from(atob(text), value => value.charCodeAt(0))], { type: 'image/png' }));
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height), context = canvas.getContext('2d');
        context.drawImage(bitmap, 0, 0);
        const result = { width: bitmap.width, height: bitmap.height, data: context.getImageData(0, 0, bitmap.width, bitmap.height).data };
        bitmap.close();
        return result;
      };
      const [left, right] = await Promise.all(images.map(decode));
      if (left.width !== right.width || left.height !== right.height) return { equivalent: false, dimensionsDiffer: true };
      let differentPixels = 0, maxChannelDelta = 0, minX = left.width, minY = left.height, maxX = 0, maxY = 0;
      for (let index = 0; index < left.data.length; index += 4) {
        let delta = 0;
        for (let channel = 0; channel < 4; channel++) delta = Math.max(delta, Math.abs(left.data[index + channel] - right.data[index + channel]));
        if (!delta) continue;
        differentPixels++; maxChannelDelta = Math.max(maxChannelDelta, delta);
        const x = index / 4 % left.width, y = Math.floor(index / 4 / left.width);
        minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      }
      return {
        differentPixels, maxChannelDelta,
        bounds: differentPixels ? { minX, minY, maxX, maxY } : null,
        equivalent: differentPixels <= 8 && maxChannelDelta <= 5
      };
    }, images);
  } finally { await page.close(); }
}
async function downloadHash(page, selector) {
  const pending = page.waitForEvent('download');
  await page.locator(selector).click();
  const download = await pending;
  const digest = createHash('sha256'), stream = await download.createReadStream();
  let bytes = 0;
  for await (const chunk of stream) { digest.update(chunk); bytes += chunk.length; }
  return { filename: download.suggestedFilename(), bytes, sha256: digest.digest('hex') };
}
async function collect(browser, channel, file, label) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const page = await context.newPage(), errors = [], remoteHosts = new Set(), scenes = {}, downloads = {};
  page.setDefaultTimeout(60000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/^https?:/.test(request.url())) remoteHosts.add(new URL(request.url()).hostname); });
  await page.route('https://**/*', route => route.abort());
  try {
    await page.goto(pathToFileURL(file).href, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.locator('#welcome-start').click();
    await page.waitForFunction(() => window.__atlas?.map.ready, null, { timeout: 120000 });
    console.log(`${channel}: ${label} initialized.`);
    await page.addStyleTag({ content: '* { transition: none !important; animation: none !important; caret-color: transparent !important; }' });
    const data = await page.evaluate(async () => {
      const { atlas, fieldGuide, measurementAudit } = window.__atlas;
      const text = JSON.stringify({ atlas, fieldGuide, measurementAudit });
      const bytes = new TextEncoder().encode(text);
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      return {
        bytes: bytes.length, sha256: [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join(''),
        routes: atlas.routes.length, retiredRoutes: atlas.retiredRoutes.length,
        routePoints: atlas.routes.reduce((sum, route) => sum + route.geometry.coordinates.length, 0)
      };
    });
    async function scene(name) {
      await page.mouse.move(2, 2);
      await page.waitForFunction(() => window.__atlas.map.raw.loaded() && !window.__atlas.map.raw.isMoving());
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(750);
      const state = await page.evaluate(() => {
        const { store, map } = window.__atlas;
        const sources = map.raw.getStyle().sources;
        return JSON.stringify({
          language: document.documentElement.lang, theme: document.documentElement.dataset.theme,
          selectionCount: document.getElementById('selection-count').textContent,
          state: { ...store.state, selectedIds: [...store.state.selectedIds] },
          detail: document.getElementById('detail-content').innerText,
          routes: document.getElementById('route-list').innerText,
          comparison: document.getElementById('comparison').innerText,
          directions: [...document.querySelectorAll('#route-list [data-google-route]')].map(link => link.getAttribute('href')),
          map: Object.fromEntries(['atlas-routes', 'atlas-places', 'atlas-waypoints', 'atlas-ghat-section', 'atlas-elevation-cursor']
            .map(id => [id, sources[id].data])),
          camera: { center: map.raw.getCenter().toArray(), zoom: map.raw.getZoom(), bearing: map.raw.getBearing(), pitch: map.raw.getPitch() }
        });
      });
      const image = await page.screenshot({ path: resolve(directory, `${label}-${channel}-${name}.png`), mask: [page.locator('#map-status')] });
      const pixels = await page.evaluate(async base64 => {
        const bytes = Uint8Array.from(atob(base64), value => value.charCodeAt(0));
        const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const context = canvas.getContext('2d');
        context.drawImage(bitmap, 0, 0);
        const digest = await crypto.subtle.digest('SHA-256', context.getImageData(0, 0, bitmap.width, bitmap.height).data);
        bitmap.close();
        return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
      }, image.toString('base64'));
      scenes[name] = { stateSha256: hash(state), pixelSha256: pixels };
    }
    await scene('overview');
    await page.locator('[data-entity="tamhini"]').click();
    await page.locator('#route-list [data-current="true"] [data-select]').nth(0).check();
    await page.locator('#route-list [data-current="true"] [data-select]').nth(1).check();
    await page.locator('#route-list [data-current="true"] [data-journey] summary').first().click();
    downloads.journey = await downloadHash(page, '#route-list [data-current="true"] [data-journey-evidence] >> nth=0');
    await scene('tamhini');
    await page.locator('[data-profile-slider]').focus();
    await page.keyboard.press('End');
    await page.locator('[data-profile-chart]').scrollIntoViewIfNeeded();
    await scene('terrain');
    await page.locator('#elevation-evidence-tamhini').locator('..').locator(':scope > summary').click();
    downloads.profile = await downloadHash(page, '[data-profile-evidence="tamhini"]');
    await page.locator('#reset-all').click();
    await page.locator('[data-entity="bor"]').click();
    for (const id of ['old-highway', 'expressway-missing-link', 'expressway-original']) {
      await page.locator(`[data-bor-alignment="${id}"]`).click();
      await scene(`bor-${id}`);
    }
    await page.locator('#reset-all').click();
    await page.locator('[data-mode="beaches"]').click();
    await page.locator('[data-entity="diveagar"]').click();
    await page.locator('#compare-button').click();
    await page.locator('#available-weights').click();
    await page.locator('[data-weight="distance"]').focus();
    await page.keyboard.press('End');
    await scene('comparison');
    await page.locator('#close-comparison').click();
    for (const language of ['mr', 'hi']) {
      await page.locator('#language-select').selectOption(language);
      await scene(language);
    }
    await page.locator('#language-select').selectOption('en');
    await page.locator('#about-button').click();
    for (const kind of ['data', 'sources', 'measurements', 'map-names']) downloads[kind] = await downloadHash(page, `[data-download="${kind}"]`);
    return { data, scenes, downloads, errors, remoteHosts: [...remoteHosts].sort() };
  } finally { await context.close(); }
}

const report = {
  baseline: baselinePath, candidate: candidatePath, channels: {}, errors: [],
  visualComparison: { viewport: '1440x1000', masked: ['transient map tile status'], maxDifferentPixels: 8, maxChannelDelta: 5 }
};
for (const channel of ['chrome', 'msedge']) {
  const browser = await chromium.launch({ channel });
  try {
    const baseline = await collect(browser, channel, baselinePath, 'baseline');
    const candidate = await collect(browser, channel, candidatePath, 'candidate');
    const sceneComparisons = {};
    for (const name of Object.keys(baseline.scenes)) {
      const identical = baseline.scenes[name].pixelSha256 === candidate.scenes[name].pixelSha256;
      const difference = identical ? { differentPixels: 0, maxChannelDelta: 0, bounds: null, equivalent: true } :
        await imageDifference(browser, resolve(directory, `baseline-${channel}-${name}.png`), resolve(directory, `candidate-${channel}-${name}.png`));
      sceneComparisons[name] = {
        stateIdentical: baseline.scenes[name].stateSha256 === candidate.scenes[name].stateSha256,
        pixelsIdentical: identical, ...difference
      };
    }
    const result = {
      dataIdentical: JSON.stringify(baseline.data) === JSON.stringify(candidate.data),
      exportsIdentical: JSON.stringify(baseline.downloads) === JSON.stringify(candidate.downloads),
      scenes: sceneComparisons,
      baseline, candidate
    };
    if (!result.dataIdentical || !result.exportsIdentical || baseline.errors.length || candidate.errors.length ||
      Object.values(result.scenes).some(scene => !scene.stateIdentical || !scene.equivalent) ||
      [...baseline.remoteHosts, ...candidate.remoteHosts].some(host => host !== 'tiles.openfreemap.org')) {
      report.errors.push(`Product comparison failed in ${channel}.`);
    }
    report.channels[channel] = result;
    console.log(`${channel}: data=${result.dataIdentical}, exports=${result.exportsIdentical}, scenes=${JSON.stringify(result.scenes)}`);
  } finally { await browser.close(); }
}
const [baseline, candidate] = await Promise.all([readFile(baselinePath), readFile(candidatePath)]);
report.products = {
  baseline: { bytes: baseline.length, sha256: hash(baseline) },
  candidate: { bytes: candidate.length, sha256: hash(candidate) }
};
await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
if (report.errors.length) throw new Error(report.errors.join('\n'));
