import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { journeyBreakdown } from '../src/journey.js';
import { loadRouteRecord, auditResponse, haversine } from './prepare-routes.mjs';

const load = async name => JSON.parse(await readFile(resolve(name), 'utf8'));
export function validateFieldGuide(guide, atlas, sources, stories) {
  const errors = [];
  const check = (condition, message) => { if (!condition) errors.push(message); };
  const sourceIds = new Set([...sources, ...guide.sources].map(source => source.id));
  check(new Set(guide.sources.map(source => source.id)).size === guide.sources.length, 'Duplicate field-guide source');
  for (const source of guide.sources) check(source.title && /^https:\/\//.test(source.url) && source.retrievedAt && source.description && source.license, `Incomplete field-guide source ${source.id}`);
  check(Object.keys(guide.routes).length === atlas.routes.length && Object.keys(guide.routes).every(id => atlas.routes.some(route => route.id === id)), 'Incomplete journey coverage');
  check(Object.keys(guide.ghats).length === atlas.ghats.length && Object.keys(guide.ghats).every(id => atlas.ghats.some(ghat => ghat.id === id)), 'Incomplete profile coverage');
  const validSources = ids => Array.isArray(ids) && ids.length > 0 && ids.every(id => sourceIds.has(id));
  check(guide.terminology?.text && validSources(guide.terminology.sourceIds), 'Unsourced terminology');
  for (const route of atlas.routes) {
    const journey = guide.routes[route.id];
    if (!journey) continue;
    check(journey.cacheFile === route.provenance.cacheFile && validSources(journey.sourceIds), `Unreferenced journey ${route.id}`);
    try {
      const expected = journeyBreakdown(route, journey.legEvidence.map(leg => ({ distance: leg.distanceM, duration: leg.durationSeconds })));
      check(JSON.stringify(expected.stages) === JSON.stringify(journey.stages), `Unreconciled journey stages ${route.id}`);
    } catch (error) { errors.push(error.message); }
  }
  for (const ghat of atlas.ghats) {
    const item = guide.ghats[ghat.id];
    if (!item) continue;
    check(JSON.stringify(item.stories) === JSON.stringify(stories.ghats[ghat.id] || {}), `Unreproduced story curation ${ghat.id}`);
    check(item.stories.significance?.text, `Missing sourced ghat significance ${ghat.id}`);
    for (const [field, claim] of Object.entries(item.stories)) {
      check(claim.text && claim.locator && claim.kind && validSources(claim.sourceIds), `Unsourced field note ${ghat.id}/${field}`);
      if (field === 'legends') check(claim.kind === 'recorded-tradition', `Tradition presented as fact ${ghat.id}`);
      if (field === 'forts') check(['nearby-fort-only', 'documented-pass-defence', 'documented-fort-road-association', 'documented-regional-watch'].includes(claim.kind), `Unqualified fort role ${ghat.id}`);
    }
    const profile = item.elevation;
    const route = atlas.routes.find(route => route.id === profile?.routeId);
    const section = route?.provenance.ghatSections.find(section => section.ghatId === ghat.id);
    check(profile?.ghatId === ghat.id && section && profile.sectionDistanceM === section.distanceM && validSources(profile.sourceIds), `Unreferenced elevation alignment ${ghat.id}`);
    if (!section) continue;
    check(profile.entryPlaceId === section.entryPlaceId && profile.exitPlaceId === section.exitPlaceId, `Changed ghat profile boundaries ${ghat.id}`);
    const a = route.provenance.waypointPositions.find(point => point.placeId === section.entryPlaceId);
    const z = route.provenance.waypointPositions.find(point => point.placeId === section.exitPlaceId);
    check(profile.geometry?.type === 'LineString' && JSON.stringify(profile.geometry.coordinates) === JSON.stringify(route.geometry.coordinates.slice(a.geometryIndex, z.geometryIndex + 1)), `Invented ghat highlight ${ghat.id}`);
    check(profile.samples.length >= 2 && profile.samples.length <= 100 && profile.samples[0].distanceM === 0 && Math.abs(profile.samples.at(-1).distanceM - section.distanceM) < 0.001, `Invalid elevation extent ${ghat.id}`);
    check(profile.dataset === 'srtm30m' && profile.resolutionM === 30 && profile.evidence?.status === 'OK' && profile.evidence.results.length === profile.samples.length && profile.requestUrl?.startsWith('https://api.opentopodata.org/v1/srtm30m?'), `Missing elevation provider evidence ${ghat.id}`);
    for (const [index, sample] of profile.samples.entries()) {
      const evidence = profile.evidence?.results?.[sample.responseIndex];
      check(sample.responseIndex === index && evidence?.dataset === 'srtm30m' && sample.elevationM === evidence.elevation &&
        Math.abs(sample.coordinates[0] - evidence.location.lng) < 1e-7 && Math.abs(sample.coordinates[1] - evidence.location.lat) < 1e-7, `Unbacked elevation sample ${ghat.id}/${index}`);
      check(index === 0 || sample.distanceM > profile.samples[index - 1].distanceM, `Unordered elevation sample ${ghat.id}/${index}`);
      check(sample.elevationM === null || (Number.isFinite(sample.elevationM) && sample.elevationM >= -100 && sample.elevationM <= 3000), `Invalid terrain elevation ${ghat.id}/${index}`);
    }
    const complete = profile.samples.every(sample => Number.isFinite(sample.elevationM));
    check(profile.status === (complete ? 'available' : 'missing-samples'), `False elevation availability ${ghat.id}`);
  }
  return errors;
}

export async function validateFieldGuideFiles(atlas, sources) {
  const [guide, stories] = await Promise.all(['data/field-guide.json', 'data/ghat-stories.json'].map(load));
  const errors = validateFieldGuide(guide, atlas, sources, stories);
  const profileRouteIds = new Set(Object.values(guide.ghats).map(item => item.elevation.routeId));
  const profileRecords = new Map();
  for (const route of atlas.routes) {
    const journey = guide.routes[route.id];
    if (!journey) continue;
    const record = await loadRouteRecord(route.provenance.cacheFile);
    if (profileRouteIds.has(route.id)) profileRecords.set(route.id, record);
    const expected = record.response.routes[0].legs.map((leg, index) => ({ index, distanceM: leg.distance, durationSeconds: leg.duration }));
    if (JSON.stringify(expected) !== JSON.stringify(journey.legEvidence) || journey.requestUrl !== record.requestUrl || journey.retrievedAt !== record.retrievedAt || JSON.stringify(journey.sourceLegs) !== JSON.stringify(record.composition || null)) errors.push(`Journey evidence differs from provider cache ${route.id}`);
  }
  for (const ghat of atlas.ghats) {
    const profile = guide.ghats[ghat.id]?.elevation;
    if (!profile) continue;
    const record = await load(profile.cacheFile);
    if (JSON.stringify(record.response) !== JSON.stringify(profile.evidence) || record.requestUrl !== profile.requestUrl || record.retrievedAt !== profile.retrievedAt) errors.push(`Elevation evidence differs from provider cache ${ghat.id}`);
    const route = atlas.routes.find(route => route.id === profile.routeId);
    const road = profileRecords.get(profile.routeId);
    const indices = auditResponse(road);
    const a = route.waypointIds.indexOf(profile.entryPlaceId), z = route.waypointIds.indexOf(profile.exitPlaceId);
    const coordinates = road.response.routes[0].geometry.coordinates.slice(indices[a], indices[z] + 1);
    const cumulative = [0];
    for (let i = 1; i < coordinates.length; i++) cumulative.push(cumulative.at(-1) + haversine(coordinates[i - 1], coordinates[i]));
    let previous = -1;
    for (const sample of profile.samples) {
      const index = sample.roadVertexIndex, point = coordinates[index];
      if (!Number.isInteger(index) || index <= previous || !point || point[0] !== sample.coordinates[0] || point[1] !== sample.coordinates[1] ||
          Math.abs(cumulative[index] / cumulative.at(-1) * profile.sectionDistanceM - sample.distanceM) > 0.001) errors.push(`Terrain sample not on ordered ghat geometry ${ghat.id}/${sample.responseIndex}`);
      previous = index;
    }
  }
  return { guide, errors };
}
