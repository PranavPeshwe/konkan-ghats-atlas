import { test, expect } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { dismissWelcome } from './browser-helpers.mjs';

const url = pathToFileURL(path.resolve('pune_to_konkan.html')).href;
async function open(page) {
  await page.route('https://**/*', route => route.abort());
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(url);
  await dismissWelcome(page);
  await expect.poll(() => page.evaluate(() => window.__atlas?.map.ready)).toBe(true);
}

test('English-first selector switches the whole interface without losing journey state', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await open(page);
  expect(await page.locator('#language-select option').evaluateAll(options => options.map(option => option.value))).toEqual(['en', 'mr', 'hi']);
  await expect(page.locator('#language-select')).toHaveValue('en');
  const language = await page.locator('#language-select').boundingBox();
  const about = await page.locator('#about-button').boundingBox();
  expect(language.x + language.width).toBeLessThanOrEqual(about.x);
  await expect(page.locator('#theme-select')).toHaveCount(0);
  await page.locator('[data-entity="tamhini"]').click();
  await page.locator('#route-list [data-select]').first().check();
  await page.locator('#max-distance').fill('400');
  const snapshot = () => page.evaluate(() => ({
    state: { ...window.__atlas.store.state, selectedIds: [...window.__atlas.store.state.selectedIds] },
    center: window.__atlas.map.raw.getCenter().toArray(), zoom: window.__atlas.map.raw.getZoom()
  }));
  const before = await snapshot();
  for (const id of ['mr', 'hi']) {
    await page.locator('#language-select').selectOption(id);
    await expect(page.locator('html')).toHaveAttribute('lang', id);
    await expect(page.locator('[data-entity="tamhini"] .item-name')).toHaveText('ताम्हिणी घाट');
    await expect(page.locator('#about-button')).toHaveText(id === 'mr' ? 'या मार्गदर्शकाविषयी' : 'इस मानचित्र के बारे में');
    await expect(page.locator('#reset-all')).not.toContainText('Reset all');
    await expect(page.locator('#route-list [data-fit]').first()).not.toContainText('Trace on map');
    expect(await snapshot()).toEqual(before);
    expect(await page.evaluate(() => window.__atlas.map.raw.getStyle().sources['atlas-places'].data.features.find(feature => feature.properties.id === 'tamhini').properties.name)).toBe('ताम्हिणी घाट');
    await page.locator('#route-list [data-journey] summary').first().click();
    await expect(page.locator('#route-list [data-journey]').first().locator('[data-stage]')).toHaveCount(3);
    await expect(page.locator('#route-list [data-journey]').first()).not.toContainText('Pune to chosen');
    await page.locator('#route-list [data-journey] summary').first().click();
    const link = new URL(await page.locator('#route-list [data-google-route]').first().getAttribute('href'));
    expect(link.searchParams.get('hl')).toBe(id);
    await page.locator('#compare-button').click();
    await expect(page.locator('[data-weight]')).toHaveCount(4);
    for (const weight of await page.locator('[data-weight]').all()) {
      await expect(weight).not.toHaveAttribute('aria-label', /[A-Za-z]/);
    }
    await expect(page.locator('#weights-heading')).toHaveText(id === 'mr' ? 'तुमच्यासाठी काय महत्त्वाचे?' : 'आपके लिए क्या महत्त्वपूर्ण है?');
    await expect(page.locator('.comparison-table')).not.toContainText('YOUR SCORE');
    await page.locator('#close-comparison').click();
    await page.screenshot({ path: `test-results/language-${id}-${test.info().project.name}.png` });
  }
  await page.locator('#language-select').selectOption('en');
  await expect(page.locator('#about-button')).toHaveText('About this atlas');
  expect(new URL(await page.locator('#route-list [data-google-route]').first().getAttribute('href')).searchParams.has('hl')).toBe(false);
  await expect(page.locator('#route-list [data-current="true"]')).toHaveCount(10);
  await page.locator('#language-select').selectOption('mr');
  await page.locator('#search').fill('अलिबाग');
  await expect(page.locator('[data-result="alibag"][data-kind="beaches"]')).toBeVisible();
  await page.locator('[data-result="alibag"][data-kind="beaches"]').click();
  await expect(page.locator('#selection-count')).toHaveText('५');
  await expect(page.locator('html')).toHaveAttribute('lang', 'mr');
  await page.locator('#reset-all').click();
  await expect(page.locator('#language-select')).toHaveValue('en');
  await expect(page.locator('#search')).toHaveValue('');
  await expect(page.locator('#route-list .route-card')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('both native languages fit the Ocean-only header and refresh defaults to English', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page);
  for (const language of ['mr', 'hi']) {
    await page.locator('#language-select').selectOption(language);
    const layout = await page.evaluate(() => {
      const language = document.getElementById('language-select');
      const header = document.querySelector('.masthead');
      return {
        overflow: header.scrollWidth > header.clientWidth,
        language: getComputedStyle(language).backgroundColor,
        about: getComputedStyle(document.getElementById('about-button')).backgroundColor,
        compareRight: document.getElementById('compare-button').getBoundingClientRect().right
      };
    });
    expect(layout.overflow).toBe(false);
    expect(layout.compareRight).toBeLessThanOrEqual(1280);
    expect(layout.language).not.toBe(layout.about);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'ocean');
  }
  await page.reload();
  await expect(page.locator('#language-select')).toHaveValue('en');
  await expect(page.locator('#welcome-dialog')).toBeVisible();
});
