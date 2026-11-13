import test from 'node:test';
import assert from 'node:assert/strict';
import { routeView, sortByDistance, shortestByGhat } from '../src/routes.js';
import { createSearch } from '../src/search.js';
import { initialState } from '../src/state.js';
import { createColorScheme } from '../src/colors.js';

const beaches = Array.from({ length: 12 }, (_, index) => ({ id: `beach-${index}`, name: `Beach ${index}` }));
const routes = [12, 2, 11, 1, 10, 3, 9, 4, 8, 5, 7, 6].map((distanceKm, index) => ({
  id: `ghat-a-beach-${index}`, name: `Beach ${index} via Ghat A`,
  beachId: `beach-${index}`, ghatIds: ['ghat-a'], waypointIds: [],
  distanceKm, durationHours: distanceKm, scenery: 3, difficulty: 2
}));
const atlas = { ghats: [{ id: 'ghat-a', name: 'Ghat A' }], beaches, places: [], routes: [
  ...routes,
  { ...routes[3], id: 'longer-same-beach', distanceKm: 20 },
  ...['b', 'c', 'd', 'e', 'f'].map((name, index) => ({
    ...routes[3], id: `ghat-${name}-beach-3`, ghatIds: [`ghat-${name}`], distanceKm: index + 2
  })),
  { ...routes[3], id: 'highway-via-b', ghatIds: ['ghat-b'], kind: 'highway', distanceKm: 2.5 }
] };
const search = createSearch(atlas);
const focus = { type: 'ghats', id: 'ghat-a' };

test('a ghat shows ten different beaches in true distance order, not file order', () => {
  const view = routeView(atlas, search, { ...initialState(), focus });
  assert.deepEqual(view.displayed.map(route => route.distanceKm), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(new Set(view.displayed.map(route => route.beachId)).size, 10);
  assert.equal(view.displayed.some(route => route.id === 'longer-same-beach'), false);
  assert.deepEqual(view.mapRoutes, view.displayed);
});
test('filters narrow the ten-beach shortlist rather than silently promoting farther beaches', () => {
  const state = { ...initialState(), focus, query: 'Beach 2' };
  assert.equal(routeView(atlas, search, state).displayed.length, 0);
  state.query = '';
  state.filters.maxDistance = 2;
  assert.deepEqual(routeView(atlas, search, state).displayed.map(route => route.distanceKm), [1, 2]);
});
test('a beach lists five shortest distinct primary ghats without duplicate highway alternatives', () => {
  const beachState = { ...initialState(), focus: { type: 'beaches', id: 'beach-3' } };
  assert.deepEqual(routeView(atlas, search, beachState).displayed.map(route => route.distanceKm), [1, 2, 3, 4, 5]);
  assert.equal(new Set(routeView(atlas, search, beachState).displayed.map(route => route.ghatIds[0])).size, 5);
});
test('an approach ghat on an access loop is not counted as another independent alternative', () => {
  const loop = { ...routes[3], id: 'raghuvir-beach-3', ghatIds: ['ambenali', 'raghuvir'], distanceKm: 8 };
  assert.deepEqual(shortestByGhat([loop, { ...loop, id: 'longer-loop', primaryGhatId: 'raghuvir', distanceKm: 9 }]), [loop]);
});
test('overview keeps searchable catalogue data but hides routes until a place is chosen', () => {
  for (const query of ['', 'Ghat A', 'Beach 3']) {
    const view = routeView(atlas, search, { ...initialState(), query });
    assert.ok(view.filtered.length > 0);
    assert.deepEqual(view.displayed, []);
    assert.deepEqual(view.mapRoutes, []);
  }
});
test('route distance sorting remains stable', () => {
  assert.deepEqual(sortByDistance([{ id: 'b', distanceKm: 10 }, { id: 'a', distanceKm: 10 }]).map(route => route.id), ['a', 'b']);
});
test('route IDs and route objects share colours, and a ghat has distinct destination colours', () => {
  const colors = createColorScheme(atlas);
  assert.equal(colors.routeColor(routes[0]), colors.routeColor(routes[0].id));
  assert.equal(new Set(routes.map(route => colors.routeColor(route))).size, routes.length);
});
