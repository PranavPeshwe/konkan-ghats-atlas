import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { withBorAlignments } from '../src/bor-alignments.js';
import { createSearch } from '../src/search.js';
import { initialState, reduceState } from '../src/state.js';
import { routeView, shortestByGhat, borAlignmentId } from '../src/routes.js';
import { createColorScheme } from '../src/colors.js';
import { googleMapsUrl } from '../src/google-maps.js';
import { loadRouteRecord, auditResponse } from '../tools/prepare-routes.mjs';

const load = async file => JSON.parse(await readFile(new URL(`../data/${file}`, import.meta.url), 'utf8'));
const [base, options] = await Promise.all(['atlas.json', 'bor-road-options.json'].map(load));
const atlas = withBorAlignments(base, options), search = createSearch(atlas);
const state = { ...initialState(), focus: { type: 'ghats', id: 'bor' } };

test('Bor offers all three alignments for ten distinct beaches, or one alignment independently', () => {
  const all = routeView(atlas, search, state).displayed;
  assert.equal(all.length, 30);
  assert.equal(new Set(all.map(route => route.beachId)).size, 10);
  assert.deepEqual(all.map(route => route.distanceKm), all.map(route => route.distanceKm).toSorted((a, b) => a - b));
  for (const variant of options.variants) {
    const filtered = routeView(atlas, search, reduceState(state, { type: 'bor-alignment', id: variant.id })).displayed;
    assert.equal(filtered.length, 10);
    assert.ok(filtered.every(route => borAlignmentId(route) === variant.id));
  }
  assert.equal(reduceState({ ...state, borAlignment: 'expressway-original' }, { type: 'reset' }).borAlignment, 'all');
});
test('beach discovery offers three Bor roads without counting them as extra ghats or preselecting seven roads', () => {
  const view = routeView(atlas, search, { ...state, focus: { type: 'beaches', id: 'alibag' } });
  assert.equal(view.displayed.filter(route => borAlignmentId(route)).length, 3);
  assert.equal(shortestByGhat(view.focusRoutes).length, 5);
  assert.equal(view.displayed.length, 7);
});
test('old source records remain unchanged and false legacy expressway records are retired', () => {
  for (const route of base.routes) {
    const active = atlas.routes.find(item => item.id === route.id);
    assert.deepEqual(active || atlas.retiredRoutes.find(item => item.id === route.id), route);
  }
  for (const id of options.retiredRouteIds) assert.equal(atlas.routes.some(route => route.id === id), false);
  assert.ok(search.search('Alibag Missing Link').some(result => result.entity.id === 'bor-expressway-missing-link-alibag'));
  assert.ok(search.search('Alibag old highway').some(result => result.entity.id === 'bor-alibag'));
});
test('same-beach alignment colours and complete Google direction anchors remain distinct', () => {
  const routes = atlas.routes.filter(route => route.beachId === 'alibag' && borAlignmentId(route));
  const colors = createColorScheme(atlas);
  assert.equal(new Set(routes.map(route => colors.routeColor(route))).size, 3);
  for (const route of options.routes) {
    const url = new URL(googleMapsUrl(route));
    const points = url.searchParams.get('waypoints').split('|');
    for (const position of route.provenance.waypointPositions.slice(1, -1)) {
      assert.ok(points.includes(`${position.coordinates[1].toFixed(6)},${position.coordinates[0].toFixed(6)}`));
    }
  }
});
test('the actual cached Missing Link prefix traverses both tunnels while the original expressway excludes it', async () => {
  for (const variant of options.variants.filter(variant => variant.prefixCacheFile)) {
    const record = await loadRouteRecord(variant.prefixCacheFile);
    auditResponse(record);
    const steps = record.response.routes[0].legs.flatMap(leg => leg.steps);
    const missing = steps.filter(step => /Missing Link|Connecting Link/i.test(step.name || ''));
    if (variant.id === 'expressway-missing-link') assert.ok(missing.reduce((sum, step) => sum + step.distance, 0) > 9000);
    else {
      assert.equal(missing.length, 0);
      assert.ok(steps.some(step => /Khandala Tunnel/i.test(step.name || '')));
    }
  }
});
