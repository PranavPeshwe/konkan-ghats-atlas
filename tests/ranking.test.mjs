import test from 'node:test';
import assert from 'node:assert/strict';
import { createRanking } from '../src/ranking.js';

const routes = [
  { id: 'fast', beachId: 'beach-a', durationHours: 3, distanceKm: 160, difficulty: 2, scenery: 2 },
  { id: 'scenic', beachId: 'beach-a', durationHours: 5, distanceKm: 200, difficulty: 4, scenery: 5 },
  { id: 'other', beachId: 'beach-b', durationHours: 8, distanceKm: 400, difficulty: 4, scenery: 5 }
];
const ranking = createRanking(routes);
test('time and scenery weights reorder comparable routes without global destination ranking', () => {
  assert.equal(ranking.rank(routes.slice(0, 2), { time: 10 })[0].route.id, 'fast');
  assert.equal(ranking.rank(routes.slice(0, 2), { scenery: 10 })[0].route.id, 'scenic');
  assert.deepEqual(ranking.rank(routes, { time: 10 }).map(r => r.route.beachId), ['beach-a', 'beach-a', 'beach-b']);
});
test('all four available criteria can score a complete route without a toll input', () => {
  const result = ranking.score(routes[1], { time: 5, distance: 5, scenery: 5, difficulty: 5 });
  assert.equal(result.status, 'complete');
  assert.deepEqual(result.contributions.map(item => item.key), ['time', 'distance', 'scenery', 'difficulty']);
  assert.equal(ranking.score({ ...routes[1], scenery: null }, { scenery: 5 }).status, 'incomplete');
});
test('all-zero weights disable scoring and constant ranges are finite', () => {
  assert.equal(ranking.score(routes[0], { time: 0 }).status, 'disabled');
  assert.equal(ranking.score(routes[2], { time: 5 }).score, 100);
});
test('filtering a candidate set never changes a retained score', () => {
  const before = ranking.rank(routes.slice(0, 2), { time: 5, scenery: 3 }).find(r => r.route.id === 'scenic');
  const after = ranking.rank([routes[1]], { time: 5, scenery: 3 })[0];
  assert.equal(before.score, after.score);
});
