import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const samples = JSON.parse(await readFile(resolve('data', 'maharashtra-label-samples.json'), 'utf8'));
const endpoint = 'https://www.openstreetmap.org/api/0.6';
const directory = resolve('data', 'maharashtra-name-cache');
await mkdir(directory, { recursive: true });
const intersectsRegionalEnvelope = feature => {
  const points = feature.geometry.type === 'Point' ? [feature.geometry.coordinates] : feature.geometry.coordinates.flat(feature.geometry.type === 'MultiLineString' ? 1 : 0);
  return points.some(([longitude, latitude]) => longitude >= 72.55 && longitude <= 80.95 && latitude >= 15.6 && latitude <= 22.05);
};
const unique = new Map(samples.snapshots.flatMap(snapshot => snapshot.features).filter(intersectsRegionalEnvelope).map(feature => [feature.id, feature]));
console.log(`Reading native spellings for ${unique.size} sampled regional features; this envelope is not a state-boundary claim.`);
const requests = [];
const records = [];
for (const [type, suffix] of [['node', 1], ['way', 2], ['relation', 3]]) {
  const ids = [...unique.keys()].filter(id => Number.isSafeInteger(id) && id % 10 === suffix).map(id => Math.floor(id / 10)).sort((a, b) => a - b);
  for (let offset = 0; offset < ids.length; offset += 50) {
    const batch = ids.slice(offset, offset + 50);
    const cacheFile = `${type}-${String(offset / 50).padStart(3, '0')}.json`;
    const url = `${endpoint}/${type}s.json?${type}s=${batch.join(',')}`;
    let response;
    try {
      const cached = JSON.parse(await readFile(resolve(directory, cacheFile), 'utf8'));
      if (cached.url === url) response = cached;
    } catch {}
    if (!response) {
      const request = await fetch(url, { signal: AbortSignal.timeout(30000), headers: { 'User-Agent': 'KonkanGhatsAtlas/1.0 (finite Maharashtra label-name verification)' } });
      if (!request.ok) throw new Error(`${type} name reference: HTTP ${request.status}`);
      const raw = await request.json();
      response = {
        url, retrievedAt: new Date().toISOString(), license: raw.license,
        elements: raw.elements.map(element => ({
          type: element.type, id: element.id, lat: element.lat, lon: element.lon,
          version: element.version, timestamp: element.timestamp,
          tags: Object.fromEntries(Object.entries(element.tags || {}).filter(([key]) =>
            ['name', 'name:en', 'name:mr', 'name:hi', 'old_name', 'alt_name', 'place', 'waterway', 'natural'].includes(key)))
        }))
      };
      await writeFile(resolve(directory, cacheFile), JSON.stringify(response) + '\n');
      await new Promise(resolve => setTimeout(resolve, 1100));
    }
    requests.push({ url, cacheFile, retrievedAt: response.retrievedAt });
    for (const element of response.elements) {
      records.push({
        osmType: element.type, osmId: element.id, tileId: element.id * 10 + suffix,
        coordinates: Number.isFinite(element.lon) ? [element.lon, element.lat] : null,
        version: element.version, timestamp: element.timestamp, cacheFile,
        names: Object.fromEntries(Object.entries(element.tags).filter(([key]) => /name/.test(key)))
      });
    }
    console.log(`Read ${type} names ${Math.min(offset + 50, ids.length)}/${ids.length}.`);
  }
}
const result = {
  scope: samples.scope,
  retrievedAt: new Date().toISOString(), endpoint, requests,
  license: 'Open Database License 1.0; © OpenStreetMap contributors.',
  policy: 'Identity-matched native-language source labels, not a claim of official or universal language verification. Match tile identity AND an original name; never use a same-name village as a substitute. Missing language tags remain unknown.',
  records
};
await writeFile(resolve('data', 'maharashtra-map-names.json'), JSON.stringify(result) + '\n');
console.log(`Saved ${records.length} sampled regional name records (${records.filter(record => record.names['name:mr']).length} Marathi, ${records.filter(record => record.names['name:hi']).length} Hindi).`);
