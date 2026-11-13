import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { googleMapsUrl } from '../src/google-maps.js';

const point = (index, role = 'via') => ({ placeId: `stop-${index}`, role, coordinates: [73 + index / 100, 18 + index / 100] });
const coordinate = p => `${p[1].toFixed(6)},${p[0].toFixed(6)}`;
const fixture = positions => ({
  id: 'crossing-beach', geometry: { coordinates: positions.map(p => p.coordinates) },
  provenance: { waypointPositions: positions }
});

test('Google directions include both endpoints and every ordered stop in latitude-longitude order without a key', () => {
  const positions = [point(0), point(1), point(2), point(3)];
  const url = new URL(googleMapsUrl(fixture(positions)));
  assert.equal(url.hostname, 'maps.google.com');
  assert.equal(url.pathname, '/maps/dir/');
  assert.equal(url.searchParams.get('api'), '1');
  assert.equal(url.searchParams.get('origin'), '18.000000,73.000000');
  assert.equal(url.searchParams.get('destination'), '18.030000,73.030000');
  assert.equal(url.searchParams.get('waypoints'), '18.010000,73.010000|18.020000,73.020000');
  assert.equal(url.searchParams.get('travelmode'), 'driving');
  assert.equal(url.searchParams.get('avoid'), 'ferries');
  assert.equal(url.searchParams.has('key'), false);
});
test('long itineraries keep all crossing anchors and junctions in their original order', () => {
  const positions = Array.from({ length: 13 }, (_, index) => point(index));
  positions[10].role = 'junction';
  const route = fixture(positions);
  route.provenance.ghatSections = [{
    entryPlaceId: 'stop-8', interiorPlaceId: 'stop-9', exitPlaceId: 'stop-11'
  }];
  const stops = new URL(googleMapsUrl(route)).searchParams.get('waypoints').split('|');
  assert.equal(stops.length, 9);
  for (const index of [8, 9, 10, 11]) assert.ok(stops.includes(coordinate(positions[index].coordinates)));
  const indices = stops.map(stop => positions.findIndex(p => coordinate(p.coordinates) === stop));
  assert.deepEqual(indices, [...indices].sort((a, b) => a - b));
});
test('a route never silently drops required anchors to exceed the Google waypoint limit', () => {
  const positions = Array.from({ length: 12 }, (_, index) => point(index, 'junction'));
  assert.throws(() => googleMapsUrl(fixture(positions)), /nine intermediate-waypoint limit/);
});
test('every bundled itinerary produces a complete-endpoint URL within Google limits', async () => {
  const atlas = JSON.parse(await readFile(new URL('../data/atlas.json', import.meta.url), 'utf8'));
  for (const route of atlas.routes) {
    const url = new URL(googleMapsUrl(route));
    assert.ok(url.href.length <= 2048, route.id);
    assert.equal(url.searchParams.get('origin'), coordinate(route.geometry.coordinates[0]), route.id);
    assert.equal(url.searchParams.get('destination'), coordinate(route.geometry.coordinates.at(-1)), route.id);
    const intermediate = route.provenance.waypointPositions.slice(1, -1);
    const actual = (url.searchParams.get('waypoints') || '').split('|').filter(Boolean);
    assert.ok(actual.length <= 9, route.id);
    if (intermediate.length <= 9) assert.deepEqual(actual, intermediate.map(p => coordinate(p.coordinates)), route.id);
    const requiredIds = (route.provenance.ghatSections || []).flatMap(section =>
      [section.entryPlaceId, section.interiorPlaceId, section.exitPlaceId]);
    for (const position of intermediate.filter(p => requiredIds.includes(p.placeId) || p.role === 'junction')) {
      assert.ok(actual.includes(coordinate(position.coordinates)), `${route.id}: ${position.placeId}`);
    }
  }
});
