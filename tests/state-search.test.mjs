import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore, initialState, reduceState } from '../src/state.js';
import { createSearch } from '../src/search.js';

const atlas = {
  ghats: [{ id: 'ghat-a', name: 'Tamhini', aliases: ['Tamini'] }],
  beaches: [{ id: 'beach-a', name: 'Diveagar', region: 'Raigad' }],
  places: [{ id: 'town-a', name: 'Mulshi' }],
  routes: [{ id: 'route-a', name: 'Pune to Diveagar', beachId: 'beach-a', ghatIds: ['ghat-a'], waypointIds: ['town-a'], distanceKm: 180, durationHours: 4, difficulty: null, scenery: 5 }]
};
const search = createSearch(atlas);
test('aliases resolve canonical entities and waypoint searches find their routes', () => {
  assert.equal(search.search('tamini')[0].entity.id, 'ghat-a');
  assert.equal(search.matchesRoute(atlas.routes[0], { ...initialState(), query: 'mulshi' }), true);
  assert.equal(search.search('no matching place').length, 0);
});
test('filters compose inclusively without rewarding unknown attributes', () => {
  const state = initialState();
  state.filters = { maxDistance: 180, maxTime: 4, difficulty: null, scenery: 5 };
  assert.equal(search.matchesRoute(atlas.routes[0], state), true);
  state.filters.difficulty = 5;
  assert.equal(search.matchesRoute(atlas.routes[0], state), false);
  state.filters = { maxDistance: 179, maxTime: null, difficulty: null, scenery: null };
  assert.equal(search.matchesRoute(atlas.routes[0], state), false);
});
test('focus and filters preserve selected routes and removal clears stale hover', () => {
  let state = reduceState(initialState(), { type: 'toggle-route', id: 'route-a' });
  state = reduceState(state, { type: 'focus', mode: 'beaches', id: 'beach-a' });
  state = reduceState(state, { type: 'filters', value: { maxDistance: 0 } });
  assert.equal(state.selectedIds.has('route-a'), true);
  state = reduceState(state, { type: 'hover', id: 'route-a' });
  state = reduceState(state, { type: 'toggle-route', id: 'route-a' });
  assert.equal(state.hoveredId, null);
});
test('batch weights notify once and ignored changes do not rerender', () => {
  const store = createStore();
  let calls = 0;
  store.subscribe(() => calls++);
  store.dispatch({ type: 'weights', value: { time: 10, scenery: 0 } });
  assert.equal(calls, 1);
  assert.equal(store.state.weights.time, 10);
  store.dispatch({ type: 'weights', value: { time: 10, unknown: 9 } });
  store.dispatch({ type: 'weight', key: 'distance', value: NaN });
  assert.equal(calls, 1);
});
test('beach focus atomically replaces prior selections and selects their map view', () => {
  const store = createStore();
  store.dispatch({ type: 'toggle-route', id: 'old-route' });
  let notifications = 0;
  store.subscribe(() => notifications++);
  store.dispatch({ type: 'focus', mode: 'beaches', id: 'beach-a', selectedIds: ['one', 'two', 'three', 'four', 'five'] });
  assert.equal(notifications, 1);
  assert.deepEqual([...store.state.selectedIds], ['one', 'two', 'three', 'four', 'five']);
  assert.equal(store.state.mapView, 'selected');
  assert.deepEqual(store.state.focus, { type: 'beaches', id: 'beach-a' });
});
test('full reset returns fresh defaults without mutating previous selections or preferences', () => {
  let state = reduceState(initialState(), { type: 'focus', mode: 'beaches', id: 'beach-a', selectedIds: ['route-a'] });
  state = { ...state, query: 'Goa', filters: { ...state.filters, maxDistance: 0 }, weights: { ...state.weights, time: 10 }, comparisonOpen: true, hoveredId: 'route-a' };
  const reset = reduceState(state, { type: 'reset' });
  assert.deepEqual(reset, initialState());
  assert.notEqual(reset.selectedIds, state.selectedIds);
  assert.equal(state.selectedIds.has('route-a'), true);
});
