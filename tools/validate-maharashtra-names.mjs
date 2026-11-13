import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { mapNameDetails, setMapNameReference } from '../src/map-names.js';
import { isNativeMapName } from '../src/map-name-reference.js';

const reference = JSON.parse(await readFile(resolve('data', 'maharashtra-map-names.json'), 'utf8'));
const samples = JSON.parse(await readFile(resolve('data', 'maharashtra-label-samples.json'), 'utf8'));
const cache = new Map(), errors = [];
for (const record of reference.records) {
  if (!cache.has(record.cacheFile)) cache.set(record.cacheFile, JSON.parse(await readFile(resolve('data', 'maharashtra-name-cache', record.cacheFile), 'utf8')));
  const original = cache.get(record.cacheFile).elements.find(element => element.id === record.osmId && element.type === record.osmType);
  if (!original) { errors.push(`Missing original: ${record.tileId}`); continue; }
  const names = Object.fromEntries(Object.entries(original.tags).filter(([key]) => /name/.test(key)));
  if (JSON.stringify(names) !== JSON.stringify(record.names)) errors.push(`Changed source spelling: ${record.tileId}`);
  const suffix = { node: 1, way: 2, relation: 3 }[record.osmType];
  if (record.tileId !== record.osmId * 10 + suffix) errors.push(`Wrong tile identity: ${record.tileId}`);
}
setMapNameReference(reference.records);
const languages = {};
for (const language of ['en', 'mr', 'hi']) {
  const statuses = {}, consistent = new Map(), mismatches = [];
  for (const snapshot of samples.snapshots) {
    for (const feature of snapshot.features) {
      const result = mapNameDetails(feature.properties, language, feature);
      statuses[result.status] = (statuses[result.status] || 0) + 1;
      if (language !== 'en' && result.status === 'approximate') errors.push(`Generated native spelling ${language}: ${feature.id}`);
      if (result.status === 'fallback' && result.name !== mapNameDetails(feature.properties, 'en', feature).name) {
        errors.push(`Changed English fallback ${language}: ${feature.id}`);
      }
      if (result.status !== 'source') continue;
      if (language !== 'en' && !isNativeMapName(result.name)) errors.push(`Wrong source script ${language}: ${feature.id}`);
      const key = `${feature.sourceLayer}:${feature.id}`;
      if (consistent.has(key) && consistent.get(key) !== result.name) mismatches.push({ key, zoom: snapshot.zoom, previous: consistent.get(key), name: result.name });
      consistent.set(key, result.name);
    }
  }
  languages[language] = { sampledOccurrences: Object.values(statuses).reduce((sum, count) => sum + count, 0), statuses, sourceIdentities: consistent.size, zoomNameDisagreements: mismatches };
  if (mismatches.length) errors.push(`Zoom-dependent source spelling: ${language}, ${mismatches.length} occurrences`);
}
const result = {
  checkedAt: new Date().toISOString(), scope: samples.scope, viewCount: samples.snapshots.length,
  regions: samples.regions.map(([name]) => name), zooms: samples.zooms,
  referenceRecords: reference.records.length, languages, errors,
  limitation: 'Source-tag fidelity and zoom consistency do not establish independent linguistic correctness for every place. Unavailable native-language names are not silently promoted to verified translations.'
};
await writeFile(resolve('data', 'maharashtra-language-audit.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
if (errors.length) process.exitCode = 1;
