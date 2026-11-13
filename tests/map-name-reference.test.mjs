import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativeNameLookup, isNativeMapName } from '../src/map-name-reference.js';
import reference from '../data/maharashtra-map-names.json' with { type: 'json' };
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { mapName, mapNameDetails, setMapNameReference } from '../src/map-names.js';

const lookup = createNativeNameLookup([
  { tileId: 101, osmType: 'node', osmId: 10, names: { name: 'Pali', 'name:en': 'Pali', 'name:mr': 'पाली', 'name:hi': 'पाली' } },
  { tileId: 201, osmType: 'node', osmId: 20, names: { name: 'Pali', 'name:mr': 'पाळी' } }
]);
test('native place names preserve their source spelling and distinguish same-name villages by identity', () => {
  assert.equal(lookup({ name: 'Pali' }, 'mr', { id: 101 }).name, 'पाली');
  assert.equal(lookup({ name: 'Pali' }, 'mr', { id: 201 }).name, 'पाळी');
  assert.equal(lookup({ name: 'Pali' }, 'hi', { id: 201 }), null);
});
test('unmatched identities, unrelated names and incorrectly tagged Latin values are not source verification', () => {
  assert.equal(lookup({ name: 'Pali' }, 'mr', { id: 301 }), null);
  assert.equal(lookup({ name: 'Another village' }, 'mr', { id: 101 }), null);
  assert.equal(lookup({ name: 'Pali' }, 'mr'), null);
  assert.equal(isNativeMapName('Pali'), false);
  assert.equal(isNativeMapName('पाली Lake'), false);
  assert.equal(isNativeMapName('पाली तलाव'), true);
});

test('bundled Maharashtra names reproduce their cached sources and stay unchanged across every supported zoom', async () => {
  const caches = new Map(), native = createNativeNameLookup(reference.records);
  let compared = 0;
  for (const record of reference.records) {
    if (!caches.has(record.cacheFile)) caches.set(record.cacheFile, JSON.parse(await readFile(resolve('data', 'maharashtra-name-cache', record.cacheFile), 'utf8')));
    const original = caches.get(record.cacheFile).elements.find(element => element.id === record.osmId && element.type === record.osmType);
    assert.ok(original, `Missing name evidence: ${record.tileId}`);
    for (const language of ['mr', 'hi']) {
      const source = original.tags[`name:${language}`];
      if (!isNativeMapName(source)) continue;
      assert.equal(record.names[`name:${language}`], source);
      for (let zoom = 5; zoom <= 16; zoom += 0.5) {
        assert.equal(native(record.names, language, { id: record.tileId, zoom }).name, source.normalize('NFC').trim());
      }
      compared++;
    }
  }
  assert.ok(compared > 400, 'Source-language evidence must not silently disappear.');
});

test('all sampled Maharashtra labels retain source names or exact English fallback instead of generated native spellings', async () => {
  setMapNameReference(reference.records);
  const samples = JSON.parse(await readFile(resolve('data', 'maharashtra-label-samples.json'), 'utf8'));
  for (const language of ['mr', 'hi']) {
    let fallbacks = 0, sourced = 0;
    for (const snapshot of samples.snapshots) for (const feature of snapshot.features) {
      const result = mapNameDetails(feature.properties, language, feature);
      assert.notEqual(result.status, 'approximate');
      assert.doesNotMatch(mapName(feature.properties, language, feature), /^[≈~]/u);
      if (result.status === 'fallback') {
        assert.equal(result.name, mapNameDetails(feature.properties, 'en', feature).name);
        fallbacks++;
      }
      if (result.status === 'source') {
        assert.equal(isNativeMapName(result.name), true);
        sourced++;
      }
    }
    assert.ok(fallbacks > 1000);
    assert.ok(sourced > 100);
  }
  const gorhe = reference.records.find(record => record.names.name === 'Gorhe');
  assert.equal(mapName(gorhe.names, 'mr', { id: gorhe.tileId }), gorhe.names['name:mr']);
  assert.equal(mapName(gorhe.names, 'hi', { id: gorhe.tileId }), 'Gorhe');
});
