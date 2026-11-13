import test from 'node:test';
import assert from 'node:assert/strict';
import { encodePolyline6, packRouteGeometries } from '../tools/pack-route-geometry.mjs';
import { decodePolyline6 } from '../src/polyline6.js';
import { restoreRouteGeometries } from '../src/geometry-package.js';

test('Polyline6 follows the standard latitude-first wire format and restores GeoJSON longitude-first coordinates', () => {
  const points = [[-120.2, 38.5], [-120.95, 40.7], [-126.453, 43.252]];
  const encoded = '_izlhA~rlgdF_{geC~ywl@_kwzCn`{nI';
  assert.equal(encodePolyline6(points), encoded);
  assert.deepEqual(decodePolyline6(encoded), points);
});

test('six-decimal values, repeated vertices, zeroes and global signed deltas remain exact', () => {
  const points = [[-180, -90], [180, 90], [-0.000001, 0.000001], [0, 0], [0, 0], [73.854499, 18.519479]];
  assert.deepEqual(decodePolyline6(encodePolyline6(points)), points);
  const document = { routes: [
    { id: 'forward', geometry: { type: 'LineString', coordinates: points } },
    { id: 'backward', geometry: { type: 'LineString', coordinates: points.toReversed() } }
  ] };
  const packed = packRouteGeometries({ document }, { encoding: 'polyline6' });
  assert.ok(packed.geometryPackage.arcs.every(arc => typeof arc === 'string'));
  const restored = structuredClone(packed.documents);
  restoreRouteGeometries(Object.values(restored), packed.geometryPackage);
  assert.deepEqual(restored.document, document);
});

test('higher precision and invalid coordinates are rejected instead of rounded or clamped', () => {
  assert.throws(() => encodePolyline6([[73.1234567, 18]]), /precision/);
  assert.throws(() => encodePolyline6([[-73.1234567, 18]]), /precision/);
  assert.throws(() => encodePolyline6([[181, 18]]), /WGS84/);
  assert.throws(() => encodePolyline6([[73, 91]]), /WGS84/);
  assert.throws(() => encodePolyline6([[73, 18, 30]]), /two-dimensional/);
});

test('truncated, invalid and overflowing encoded arcs fail explicitly', () => {
  for (const value of ['?', '_', '??_', '!!', '~~~~~~~', '\u00ff']) assert.throws(() => decodePolyline6(value), /Polyline6/);
  assert.throws(() => decodePolyline6(null), /Polyline6/);
});
