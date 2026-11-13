import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateMeasurementAudit, validateMeasurementAuditFiles } from '../tools/validate-measurement-audit.mjs';
import { markerName } from '../src/marker-names.js';

const load = async file => JSON.parse(await readFile(new URL(`../data/${file}`, import.meta.url), 'utf8'));
const [atlas, sources, guide, report, curation] = await Promise.all([
  'atlas.json', 'sources.json', 'field-guide.json', 'ghat-measurement-audit.json', 'ghat-length-sources.json'
].map(load));
const validate = candidate => validateMeasurementAudit(candidate, atlas, guide, sources, curation);

test('all terrain comparisons reproduce the separate provider caches and coordinate order', async () => {
  assert.deepEqual((await validateMeasurementAuditFiles(atlas, guide, sources)).errors, []);
});
test('agreement of terrain models cannot promote chosen anchors into verified whole-ghat boundaries', () => {
  const changed = structuredClone(report);
  changed.ghats.pargad.actualGhatLengthM = changed.ghats.pargad.modelSectionDistanceM;
  assert.ok(validate(changed).includes('Unverified whole-ghat length promoted as fact pargad'));
  for (const key of ['srtmM', 'asterM', 'copernicusM']) {
    assert.ok(report.ghats.pargad.exit[key] > report.ghats.pargad.entry[key], `Pargad plateau interval is not a descent in ${key}`);
  }
});
test('tampered samples, shifted request coordinates and hidden Bor variants are rejected', () => {
  const changed = structuredClone(report);
  changed.ghats.varandha.comparisons[2].asterM += 10;
  changed.ghats.tamhini.sourceRecords.copernicus.requestUrl = changed.ghats.tamhini.sourceRecords.copernicus.requestUrl.replace('latitude=', 'unused=');
  changed.ghats.bor.sectionLengthVariantsM = [changed.ghats.bor.modelSectionDistanceM];
  const errors = validate(changed);
  assert.ok(errors.includes('Unbacked three-product comparison varandha/2'));
  assert.ok(errors.includes('Reordered Copernicus request tamhini'));
  assert.ok(errors.includes('Hidden route-section variation bor'));
});
test('a project or historical length cannot be silently reclassified as a current ghat-only estimate', () => {
  const changed = structuredClone(report);
  changed.ghats.karul.references.find(reference => reference.scope === 'ghat-plus-town-project-segment').scope = 'approximate-ghat-road';
  assert.ok(validate(changed).includes('Unreproduced boundary review karul'));
});
test('user-facing road markers do not claim unverified plateau entrances or Konkan exits', () => {
  const markers = atlas.places.filter(place => place.kind.startsWith('ghat-'));
  assert.ok(markers.length > 0);
  for (const marker of markers) {
    assert.match(markerName(marker), /chosen .*road marker/);
    assert.doesNotMatch(markerName(marker), /plateau entry|Konkan exit|interior anchor/i);
  }
});
