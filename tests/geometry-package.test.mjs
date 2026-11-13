import test from 'node:test';
import assert from 'node:assert/strict';
import { packRouteGeometries } from '../tools/pack-route-geometry.mjs';
import { restoreRouteGeometries } from '../src/geometry-package.js';
import { readFile } from 'node:fs/promises';
import { appData } from '../tools/app-data.mjs';

const route = (id, coordinates) => ({
  id, geometry: { type: 'LineString', coordinates },
  provenance: { distances: [123, 456], geometryIndices: [0, coordinates.length - 1], note: 'Retain evidence unchanged.' }
});
function roundtrip(documents, encoding = 'coordinates') {
  const before = JSON.stringify(documents);
  const packed = packRouteGeometries(documents, { encoding });
  const restored = structuredClone(packed.documents);
  restoreRouteGeometries(Object.values(restored), packed.geometryPackage);
  assert.deepEqual(restored, documents);
  assert.equal(JSON.stringify(restored), before);
  assert.equal(JSON.stringify(documents), before, 'Packing must not mutate the source.');
  return { ...packed, restored };
}

test('shared prefixes and reversed roads pack once and restore exact routes and metadata', () => {
  const a = [73.1, 18.1], b = [73.2, 18.2], c = [73.3, 18.3], d = [73.4, 18.4], e = [73.5, 18.5];
  const result = roundtrip({
    atlas: { routes: [route('first', [a, b, c, d]), route('second', [a, b, c, e])] },
    bor: { routes: [route('reverse', [d, c, b, a])] }
  });
  assert.equal(result.stats.arcs, 3);
  assert.equal(result.stats.storedArcPoints, 7);
  assert.ok(result.documents.bor.routes[0].geometry.coordinates.arcs.some(index => index < 0));
});

test('loops, repeated vertices, backtracks and one-edge roads retain every original vertex', () => {
  const a = [0, 0], b = [1, 1], c = [2, 2];
  roundtrip({ atlas: { routes: [
    route('loop', [a, b, c, a]), route('backwards-loop', [a, c, b, a]),
    route('duplicates', [a, a, b, b, c, c]),
    route('backtrack', [a, b, a, b, c]), route('edge', [a, b])
  ] } });
});

test('nearby but different coordinates never merge and reconstructed routes remain independently mutable', () => {
  const result = roundtrip({ atlas: { routes: [
    route('one', [[73, 18], [73.000001, 18], [74, 19]]),
    route('two', [[73, 18], [73.000002, 18], [74, 19]]),
    route('copy', [[73, 18], [73.000001, 18], [74, 19]])
  ] } });
  const [one, , copy] = result.restored.atlas.routes;
  assert.notEqual(one.geometry.coordinates[0], copy.geometry.coordinates[0]);
  one.geometry.coordinates[0][0] = 90;
  assert.equal(copy.geometry.coordinates[0][0], 73);
});

test('corrupt versions, references and disconnected arcs cannot silently change a route', () => {
  const original = { atlas: { routes: [route('test', [[1, 1], [2, 2], [3, 3]])] } };
  const packed = packRouteGeometries(original);
  assert.throws(() => restoreRouteGeometries(Object.values(structuredClone(packed.documents)), { ...packed.geometryPackage, version: 99 }), /Unsupported/);
  const missing = structuredClone(packed.documents);
  missing.atlas.routes[0].geometry.coordinates.arcs = [999];
  assert.throws(() => restoreRouteGeometries(Object.values(missing), packed.geometryPackage), /Unknown arc/);
  const disconnected = structuredClone(packed.documents);
  disconnected.atlas.routes[0].geometry.coordinates.arcs = [0, 0];
  assert.throws(() => restoreRouteGeometries(Object.values(disconnected), packed.geometryPackage), /Disconnected/);
  assert.throws(() => packRouteGeometries({ atlas: { routes: [route('bad', [[1, 2, 3], [2, 3, 4]])] } }), /two-dimensional/);
});

test('all original and Bor source routes round-trip deterministically without changing any source field', async () => {
  const [atlas, bor] = await Promise.all(['atlas.json', 'bor-road-options.json'].map(async name =>
    appData(JSON.parse(await readFile(new URL(`../data/${name}`, import.meta.url), 'utf8')))));
  for (const encoding of ['coordinates', 'polyline6']) {
    const result = roundtrip({ atlas, bor }, encoding);
    assert.equal(result.stats.routes, atlas.routes.length + bor.routes.length);
    assert.equal(result.stats.originalPoints, [...atlas.routes, ...bor.routes].reduce((sum, route) => sum + route.geometry.coordinates.length, 0));
    assert.ok(result.stats.storedArcPoints < result.stats.originalPoints / 5);
    const repeated = packRouteGeometries({ atlas, bor }, { encoding });
    assert.equal(JSON.stringify(repeated), JSON.stringify({ documents: result.documents, geometryPackage: result.geometryPackage, stats: result.stats }));
  }
});
