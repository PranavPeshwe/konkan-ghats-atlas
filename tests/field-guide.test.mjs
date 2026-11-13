import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { journeyBreakdown } from '../src/journey.js';
import { validateFieldGuide, validateFieldGuideFiles } from '../tools/validate-field-guide.mjs';

const load = async file => JSON.parse(await readFile(new URL(`../data/${file}`, import.meta.url), 'utf8'));
const [atlas, sources, guide, stories] = await Promise.all(['atlas.json', 'sources.json', 'field-guide.json', 'ghat-stories.json'].map(load));
test('stage boundaries use complete legs, include the interior anchor, and reconcile distance and model seconds', () => {
  const route = {
    id: 'test', distanceM: 10000, durationSeconds: 1000,
    waypointIds: ['pune', 'entry', 'interior', 'exit', 'arrival'],
    provenance: { cacheFile: 'evidence', ghatSections: [{ entryPlaceId: 'entry', exitPlaceId: 'exit' }] }
  };
  const legs = [1, 2, 3, 4].map(value => ({ distance: value * 1000, duration: value * 100 }));
  const result = journeyBreakdown(route, legs);
  assert.deepEqual(result.stages.map(stage => [stage.distanceM, stage.durationSeconds]), [[1000, 100], [5000, 500], [4000, 400]]);
  assert.throws(() => journeyBreakdown(route, legs.slice(1)), /Incomplete journey/);
  assert.throws(() => journeyBreakdown({ ...route, durationSeconds: 999 }, legs), /do not reconcile/);
  assert.throws(() => journeyBreakdown({ ...route, waypointIds: ['pune', 'wrong', 'interior', 'exit', 'arrival'] }, legs), /Invalid journey boundaries/);
});
test('all route stages, ghat highlights, narrative citations and individual elevation values reproduce their evidence', async () => {
  assert.deepEqual((await validateFieldGuideFiles(atlas, sources)).errors, []);
});
test('invented elevation values and unsourced narrative claims are rejected', () => {
  const changed = structuredClone(guide);
  changed.ghats.tamhini.elevation.samples[1].elevationM += 10;
  changed.ghats.malshej.stories.history.sourceIds = [];
  const errors = validateFieldGuide(changed, atlas, sources, stories);
  assert.ok(errors.some(error => error.startsWith('Unbacked elevation sample tamhini')));
  assert.ok(errors.includes('Unsourced field note malshej/history'));
});
test('recorded legends cannot silently become proven historical events', () => {
  const changed = structuredClone(guide);
  changed.ghats.ambenali.stories.legends.kind = 'historical-fact';
  assert.ok(validateFieldGuide(changed, atlas, sources, stories).includes('Tradition presented as fact ambenali'));
});
test('changed stage times cannot borrow the complete itinerary total without reconciling source legs', () => {
  const changed = structuredClone(guide), route = atlas.routes[0];
  changed.routes[route.id].stages[0].durationSeconds += 100;
  assert.ok(validateFieldGuide(changed, atlas, sources, stories).includes(`Unreconciled journey stages ${route.id}`));
});
