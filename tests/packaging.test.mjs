import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('generated HTML embeds scripts and styles instead of referencing sibling assets', async () => {
  const html = await readFile(new URL('../pune_to_konkan.html', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /<script[^>]+src=/i);
  assert.doesNotMatch(html, /<link[^>]+(?:stylesheet|preload)/i);
  assert.doesNotMatch(html, /\/\* ATLAS_/);
  assert.match(html, /OpenStreetMap/);
  assert.match(html, /id="usage-heading">How to use/);
  assert.match(html, /ten nearby beaches/);
  assert.match(html, /five shortest ghat routes/);
  assert.match(html, /id="reset-all"/);
});
