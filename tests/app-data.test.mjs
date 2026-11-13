import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { appData } from '../tools/app-data.mjs';
import { initialState, reduceState } from '../src/state.js';
import { createRanking } from '../src/ranking.js';
import { withBorAlignments } from '../src/bor-alignments.js';

const load = async file => JSON.parse(await readFile(new URL(`../data/${file}`, import.meta.url), 'utf8'));

test('the app projection removes toll parameters and explanatory text without changing cached source records', async () => {
  const [base, options] = await Promise.all(['atlas.json', 'bor-road-options.json'].map(load));
  const original = JSON.stringify(base);
  const projected = appData(base);
  const atlas = withBorAlignments(projected, appData(options));
  assert.doesNotMatch(JSON.stringify(atlas), /toll/i);
  assert.equal(JSON.stringify(base), original);
  for (const route of atlas.routes) {
    const source = [...base.routes, ...options.routes].find(item => item.id === route.id);
    for (const key of ['distanceM', 'durationSeconds', 'scenery', 'difficulty', 'geometry']) {
      assert.deepEqual(route[key], source[key]);
    }
  }
  const road = atlas.routes.find(route => route.scenery != null);
  assert.equal(createRanking(atlas.routes).score(road, initialState().weights).status, 'complete');
});

test('legacy toll weights cannot re-enter state or affect the four-criterion score', () => {
  const initial = initialState();
  const state = reduceState(initial, { type: 'weights', value: { tolls: 10 } });
  assert.equal(state, initial);
  assert.deepEqual(Object.keys(initial.weights), ['time', 'distance', 'scenery', 'difficulty']);
  const route = { id: 'a', beachId: 'b', durationHours: 2, distanceKm: 100, scenery: 3, difficulty: 2 };
  const ranking = createRanking([route]);
  assert.deepEqual(ranking.score(route, { ...initial.weights, tolls: 10 }), ranking.score(route, initial.weights));
});
