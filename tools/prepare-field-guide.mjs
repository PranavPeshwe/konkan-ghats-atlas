import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { loadRouteRecord, auditResponse, haversine } from './prepare-routes.mjs';
import { journeyBreakdown } from '../src/journey.js';

const load = async name => JSON.parse(await readFile(resolve(name), 'utf8'));
const save = (name, value) => writeFile(resolve(name), JSON.stringify(value, null, 2) + '\n');
const atlas = await load('data/atlas.json');
const stories = await load('data/ghat-stories.json');
const fetchMissing = process.argv.includes('--fetch');
await mkdir(resolve('data/field-guide-cache'), { recursive: true });
const guide = {
  version: 1, researchDate: '2026-11-11',
  methodology: {
    journey: 'Three contiguous groups of complete cached OSRM legs: Pune to chosen road marker A, A to B, and B to the fixed beach road arrival. These markers are not independently established ghat limits. The middle group may include approaches or omit part of the actual crossing; the final group may include further mountain descent, not just coastal driving. Metres and model seconds reconcile to the complete itinerary. No traffic, stops or parking time.',
    elevation: 'NASA/USGS SRTMGL1 v003 sampled through Open Topo Data srtm30m with bilinear interpolation. Approximately 30 m terrain raster, acquired in February 2000, not surveyed road-deck height. Forest canopy, bridges, tunnels and steep slopes may differ from actual road elevation. Samples approximately every 500 m at retained raw road vertices between chosen markers, not verified ghat entrances or exits. Along-section positions scale geodesic geometry lengths to the cached OSRM interval metres. This is a sampled-road profile, not a certified whole-ghat profile, pass altitude or road gradient.',
    history: 'Claim-level references to official gazetteers, government tourism and road records. Historical descriptions and recorded traditions are labelled as such, never current access advice. Unsupported etymologies, legends and guard-fort roles remain unknown.'
  },
  sources: [
    ...stories.sources.map(source => ({
      ...source, retrievedAt: '2026-11-11', description: source.review,
      license: 'Reference only; factual paraphrases with attribution. No source images or long text excerpts redistributed.'
    })),
    { id: 'guide-srtm', title: 'NASA/USGS SRTMGL1 v003: 1 arc-second elevation', url: 'https://www.earthdata.nasa.gov/data/catalog/lpcloud-srtmgl1-003', retrievedAt: '2026-11-11', description: 'SRTM terrain elevation product; approximately 30 m grid and EGM96 vertical reference. Radar acquisition February 2000, not current road surveying.', license: 'US government SRTM data; attribution retained.' },
    { id: 'guide-elevation-api', title: 'Open Topo Data: SRTM dataset and query methodology', url: 'https://www.opentopodata.org/datasets/srtm/', retrievedAt: '2026-11-11', description: 'Public SRTM v3 query service. Dataset, coordinates, interpolation, raw response, response index and retrieval time are retained for every sample.', license: 'Dataset attribution retained; service used for a finite cached authoring run.' }
  ],
  terminology: stories.terminology, ghats: {}, routes: {}
};
const records = new Map();
async function cachedRoute(file) {
  if (!records.has(file)) records.set(file, await loadRouteRecord(file));
  return records.get(file);
}
for (const route of atlas.routes) {
  const record = await cachedRoute(route.provenance.cacheFile);
  guide.routes[route.id] = {
    ...journeyBreakdown(route, record.response.routes[0].legs),
    requestUrl: record.requestUrl, retrievedAt: record.retrievedAt,
    legEvidence: record.response.routes[0].legs.map((leg, index) => ({ index, distanceM: leg.distance, durationSeconds: leg.duration })),
    sourceLegs: record.composition || null
  };
}
let lastRequest = 0;
for (const ghat of atlas.ghats) {
  const route = atlas.routes.find(route => route.id === ghat.closestBeachRoutes[0].routeId);
  const record = await cachedRoute(route.provenance.cacheFile);
  const indices = auditResponse(record);
  const section = route.provenance.ghatSections.find(section => section.ghatId === ghat.id);
  const a = route.waypointIds.indexOf(section.entryPlaceId), m = route.waypointIds.indexOf(section.interiorPlaceId), z = route.waypointIds.indexOf(section.exitPlaceId);
  const raw = record.response.routes[0].geometry.coordinates.slice(indices[a], indices[z] + 1);
  const cumulative = [0];
  for (let i = 1; i < raw.length; i++) cumulative.push(cumulative.at(-1) + haversine(raw[i - 1], raw[i]));
  const picked = new Set([0, indices[m] - indices[a], raw.length - 1]);
  const spacing = Math.max(500, cumulative.at(-1) / 90);
  let cursor = 0;
  for (let target = spacing; target < cumulative.at(-1); target += spacing) {
    while (cursor < cumulative.length - 1 && cumulative[cursor] < target) cursor++;
    const index = cursor > 0 && target - cumulative[cursor - 1] < cumulative[cursor] - target ? cursor - 1 : cursor;
    picked.add(index);
  }
  const samples = [...picked].sort((a, b) => a - b).map(index => ({
    coordinates: raw[index], roadVertexIndex: index,
    distanceM: cumulative[index] / cumulative.at(-1) * section.distanceM
  }));
  const locations = samples.map(sample => `${sample.coordinates[1]},${sample.coordinates[0]}`).join('|');
  const url = `https://api.opentopodata.org/v1/srtm30m?${new URLSearchParams({ locations, interpolation: 'bilinear' })}`;
  const hash = createHash('sha256').update(url).digest('hex').slice(0, 20);
  const cacheFile = `data/field-guide-cache/elevation-${ghat.id}-${hash}.json`;
  let elevation;
  try { elevation = await load(cacheFile); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    if (!fetchMissing) throw new Error(`Missing ${cacheFile}; use --fetch for the bounded elevation authoring run.`);
    await new Promise(resolve => setTimeout(resolve, Math.max(0, 1250 - (Date.now() - lastRequest))));
    lastRequest = Date.now();
    const response = await fetch(url, {
      headers: { 'User-Agent': 'KonkanGhatsAtlas/1.0 (19 cached educational ghat profiles; no runtime requests)' },
      signal: AbortSignal.timeout(60000)
    });
    const body = await response.json();
    if (!response.ok || body.status !== 'OK') throw new Error(`Elevation service ${response.status}: ${body.error || body.status}; stopped without retries.`);
    elevation = { requestUrl: url, retrievedAt: new Date().toISOString(), response: body };
    await save(cacheFile, elevation);
  }
  if (elevation.requestUrl !== url || elevation.response.status !== 'OK' || elevation.response.results.length !== samples.length) throw new Error(`Invalid elevation evidence: ${ghat.id}`);
  for (const [index, sample] of samples.entries()) {
    const point = elevation.response.results[index];
    if (point.dataset !== 'srtm30m' || Math.abs(point.location.lat - sample.coordinates[1]) > 1e-7 || Math.abs(point.location.lng - sample.coordinates[0]) > 1e-7) throw new Error(`Elevation coordinate/dataset drift: ${ghat.id}/${index}`);
    sample.elevationM = Number.isFinite(point.elevation) ? point.elevation : null;
    sample.responseIndex = index;
  }
  const start = route.provenance.waypointPositions[a].geometryIndex, end = route.provenance.waypointPositions[z].geometryIndex;
  guide.ghats[ghat.id] = {
    stories: stories.ghats[ghat.id] || {},
    elevation: {
      ghatId: ghat.id, routeId: route.id, sectionDistanceM: section.distanceM,
      entryPlaceId: section.entryPlaceId, exitPlaceId: section.exitPlaceId,
      cacheFile, retrievedAt: elevation.retrievedAt, dataset: 'srtm30m', resolutionM: 30,
      requestUrl: elevation.requestUrl, evidence: elevation.response,
      sourceIds: ['guide-srtm', 'guide-elevation-api', 'osm', 'osrm'],
      status: samples.every(sample => Number.isFinite(sample.elevationM)) ? 'available' : 'missing-samples',
      geometry: { type: 'LineString', coordinates: route.geometry.coordinates.slice(start, end + 1) },
      samples
    }
  };
  console.log(`${ghat.name}: ${samples.length} sourced terrain samples; ${guide.ghats[ghat.id].elevation.status}`);
}
await save('data/field-guide.json', guide);
console.log(`Saved ${Object.keys(guide.routes).length} reconciled journeys and ${Object.keys(guide.ghats).length} ghat profiles.`);
