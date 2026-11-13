import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { haversine, routed, auditResponse, loadRouteRecord, simplify, drivingDemand, setRequestBudget } from './prepare-routes.mjs';
import { journeyBreakdown } from '../src/journey.js';
import { googleMapsUrl } from '../src/google-maps.js';

const load = async file => JSON.parse(await readFile(resolve(file), 'utf8'));
const save = (file, value) => writeFile(resolve(file), JSON.stringify(value, null, 2) + '\n');
const query = '[out:json][timeout:25];way["highway"="motorway"](18.72,73.43,18.76,73.48);out geom;';
const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
await mkdir(resolve('data/bor-route-cache'), { recursive: true });
const file = `data/bor-route-cache/tunnel-ways-${createHash('sha256').update(url).digest('hex').slice(0, 20)}.json`;
let record;
try { record = await load(file); }
catch (error) {
  if (error.code !== 'ENOENT') throw error;
  if (!process.argv.includes('--fetch')) throw new Error(`Missing ${file}; --fetch permits one bounded corridor query.`);
  const response = await fetch(url, { signal: AbortSignal.timeout(90000), headers: { 'User-Agent': 'KonkanGhatsAtlas/1.0 (finite Bor road-alignment audit)' } });
  if (!response.ok) throw new Error(`Overpass HTTP ${response.status}; stopped, no retries.`);
  record = { requestUrl: url, retrievedAt: new Date().toISOString(), response: await response.json() };
  if (record.response.remark) throw new Error(record.response.remark);
  await save(file, record);
}
const nearest = record.response.elements.filter(way => way.tags.highway === 'motorway' && !/Missing Link/.test(way.tags.name || '')).flatMap(way => way.geometry.map(point => ({
  wayId: way.id, name: way.tags.name, ref: way.tags.ref, point: [point.lon, point.lat],
  distanceM: haversine([point.lon, point.lat], [73.455, 18.735])
}))).sort((a, b) => a.distanceM - b.distanceM);
console.log(`Junction evidence: ${record.response.elements.length} OSM ways in ${file}.`);
const atlas = await load('data/atlas.json');
const oldRoutes = atlas.routes.filter(route => route.kind === 'ghat' && route.ghatIds.includes('bor'));
const template = oldRoutes.find(route => route.id === 'bor-alibag');
const joinPosition = template.provenance.waypointPositions.find(point => point.role === 'ghat-exit');
const sourceFiles = await readdir(resolve('data/bor-route-cache'));
const waySources = [];
for (const name of sourceFiles) {
  const cached = await load(`data/bor-route-cache/${name}`);
  for (const way of cached.response.elements || []) waySources.push({ way, cacheFile: `data/bor-route-cache/${name}` });
}
const roadWay = id => {
  const source = waySources.find(source => source.way.id === id);
  if (!source) throw new Error(`Missing audited OSM way ${id}`);
  return source;
};
const point = location => [location.lon, location.lat];
const place = (id, name, coordinates, role = 'junction') => ({ id, name, coordinates, role });
const approach = place('bor-expressway-approach', 'Westbound expressway approach', point(roadWay(130710868).way.geometry[0]));
const entry = place('bor-expressway-marker-a', 'Expressway comparison marker A before the fork', nearest.find(item => item.wayId === 130710868).point, 'ghat-entry');
const junction = place(joinPosition.placeId, 'Khopoli common onward-road junction', joinPosition.coordinates, 'ghat-exit');
const origin = place(atlas.origin.id, atlas.origin.name, atlas.origin.coordinates, 'origin');
const variants = [
  { id: 'old-highway', label: 'Old Pune-Mumbai highway (NH48)', shortLabel: 'Old NH48', description: 'Existing old-highway route through Lonavala, Khandala and Khopoli. Not the expressway.', sourceIds: ['osm', 'osrm'], routeIds: oldRoutes.map(route => route.id) },
  { id: 'expressway-missing-link', label: 'Expressway with Missing Link', shortLabel: 'Missing Link', description: 'Westbound expressway through both Missing Link tunnels; the new connecting alignment, not the original Khandala expressway bend.', sourceIds: ['bor-project', 'bor-traffic-order', 'osm', 'osrm'], positions: [origin, approach, entry, place('bor-missing-link-long-portal', 'Missing Link long-tunnel east portal', point(roadWay(847213099).way.geometry[0]), 'ghat-interior'), place('bor-missing-link-short-portal', 'Missing Link short-tunnel east portal', point(roadWay(847213087).way.geometry[0])), junction] },
  { id: 'expressway-original', label: 'Expressway without Missing Link', shortLabel: 'Original expressway', description: 'Westbound original expressway via the Khandala/Adoshi alignment, explicitly avoiding the Missing Link.', sourceIds: ['bor-project', 'osm', 'osrm'], positions: [origin, approach, entry, place('bor-original-expressway-tunnel', 'Original expressway Khandala tunnel east portal', point(roadWay(22842049).way.geometry[0]), 'ghat-interior'), junction] }
];
const dataset = {
  date: '2026-11-11', ghatId: 'bor',
  scope: 'Three alternative road alignments for one Bor corridor, not three separate ghats. Whole-trip distances reuse complete directed cached legs at an identical Khopoli junction. Expressway comparison intervals include connectors and are not certified ghat-only lengths.',
  terrainPolicy: 'The available Bor terrain chart describes the old NH48 marker interval only. Surface DEM values must not be used as tunnel-road-deck heights. No surveyed expressway tunnel profile is available.',
  retiredRouteIds: atlas.routes.filter(route => route.kind === 'highway' && route.ghatIds.includes('bor')).map(route => route.id),
  retirementReason: 'Legacy highway-labelled records follow NH48 and local detours, not a verified expressway alignment. They remain in historical source files but are excluded from the active atlas.',
  sources: [
    { id: 'bor-project', title: 'MSRDC / MoEFCC: Mumbai-Pune Expressway Missing Link project note', url: 'https://forestsclearance.nic.in/writereaddata/Addinfo/0_0_6119125912121Projectnotewithsalientfeatures.pdf', retrievedAt: '2026-11-11', description: 'Separates the 13.3 km proposed connecting link from existing-expressway widening. A project extent, not the atlas ghat-only length or a substituted route metric.', license: 'Reference only; original short factual paraphrase.' },
    { id: 'bor-traffic-order', title: 'Maharashtra Highway Police: Missing Link traffic notification, October 2026', url: 'https://cdnbbsr.s3waas.gov.in/s35dec707028b05bcbd3a1db5640f842c5/uploads/2026/10/20261027800786465.pdf', retrievedAt: '2026-11-11', description: 'Records opening from 1 May 2026 and permitted non-transport light motor vehicles and passenger vehicles. A dated regulation, not live verification of closures.', license: 'Reference only; original short factual paraphrase.' }
  ],
  osmWayEvidence: [130710868, 847213099, 847213087, 22842049].map(id => ({ wayId: id, cacheFile: roadWay(id).cacheFile })),
  variants, routes: [], places: [], journeys: {}
};
setRequestBudget(2);
for (const variant of variants.filter(variant => variant.positions)) {
  const record = await routed(`bor-${variant.id}-prefix`, variant.positions.map(position => position.coordinates));
  const indices = auditResponse(record), raw = record.response.routes[0];
  if (record.response.waypoints.some(waypoint => waypoint.distance > 30)) throw new Error(`Expressway marker snap needs review: ${variant.id}`);
  const steps = raw.legs.flatMap(leg => leg.steps);
  const missingSteps = steps.filter(step => /Missing Link|Connecting Link/i.test(step.name || ''));
  if (variant.id === 'expressway-missing-link' && missingSteps.reduce((sum, step) => sum + step.distance, 0) < 9000) throw new Error('Missing Link was not actually traversed in the returned route');
  if (variant.id === 'expressway-original' && missingSteps.length) throw new Error('Original expressway route unexpectedly uses the Missing Link');
  if (variant.id === 'expressway-original' && !steps.some(step => /Khandala Tunnel/i.test(step.name || ''))) throw new Error('Original expressway Khandala alignment not established');
  if (haversine(record.response.waypoints.at(-1).location, junction.coordinates) > 0.01) throw new Error('Shared coastal-leg junction drift');
  variant.prefixCacheFile = record.cacheName;
  variant.prefixDistanceM = raw.distance;
  variant.prefixDurationSeconds = raw.duration;
  variant.comparisonIntervalM = raw.legs.slice(2).reduce((sum, leg) => sum + leg.distance, 0);
  variant.positions.forEach((position, index) => {
    position.coordinates = record.response.waypoints[index].location;
    if (!dataset.places.some(place => place.id === position.id) && !atlas.places.some(place => place.id === position.id)) dataset.places.push({
      id: position.id, name: position.name, aliases: [], coordinates: position.coordinates, kind: 'junction', sourceIds: variant.sourceIds
    });
  });
  variant.routeIds = [];
  console.log(`${variant.label}: Pune-to-common-junction ${(raw.distance / 1000).toFixed(1)} km, ${Math.round(raw.duration / 60)} model minutes; ${missingSteps.length} Missing Link steps.`);
  if (process.argv.includes('--probe')) continue;
  for (const oldRoute of oldRoutes) {
    const old = await loadRouteRecord(oldRoute.provenance.cacheFile);
    const exitIndex = oldRoute.waypointIds.indexOf(joinPosition.placeId);
    if (exitIndex < 0 || haversine(old.response.waypoints[exitIndex].location, junction.coordinates) > 0.01) throw new Error(`Coastal join not identical ${oldRoute.id}`);
    const id = `bor-${variant.id}-${oldRoute.beachId}`;
    const composition = [
      ...raw.legs.map((_, legIndex) => ({ cacheFile: record.cacheName, legIndex, reversed: false })),
      ...old.response.routes[0].legs.slice(exitIndex).map((_, index) => ({ cacheFile: oldRoute.provenance.cacheFile, legIndex: index + exitIndex, reversed: false }))
    ];
    const cacheFile = `data/cache/composed-${id}.json`;
    await save(cacheFile, { requestUrl: `osrm-cache-composition:${id}`, retrievedAt: dataset.date, dataVersion: null, composition, notes: 'Complete forward-only legs; identical common road junction. Separate expressway corridor audit; no inferred tunnel geometry or times.' });
    const full = await loadRouteRecord(cacheFile), fullIndices = auditResponse(full), fullRoute = full.response.routes[0];
    const geometry = fullIndices.slice(0, -1).flatMap((a, index) => simplify(fullRoute.geometry.coordinates.slice(a, fullIndices[index + 1] + 1), 20).slice(index ? 1 : 0));
    const inputPositions = [...variant.positions.map(place => ({ placeId: place.id, role: place.role })), ...oldRoute.provenance.waypointPositions.slice(exitIndex + 1).map(place => ({ placeId: place.placeId, role: place.role }))];
    let along = 0, previous = -1;
    const positions = inputPositions.map((position, index) => {
      if (index) along += fullRoute.legs[index - 1].distance;
      const location = full.response.waypoints[index].location;
      const geometryIndex = geometry.findIndex((point, candidate) => candidate > previous && haversine(point, location) < 0.01);
      if (geometryIndex < 0) throw new Error(`Missing retained route vertex ${id}/${index}`);
      previous = geometryIndex;
      return { ...position, coordinates: location, geometryIndex, distanceAlongM: along, snapDistanceM: full.response.waypoints[index].distance, onRoute: true };
    });
    const sectionDistanceM = fullRoute.legs.slice(2, variant.positions.length - 1).reduce((sum, leg) => sum + leg.distance, 0);
    const demand = drivingDemand(fullRoute.geometry.coordinates.slice(fullIndices[2], fullIndices[variant.positions.length - 1] + 1), sectionDistanceM);
    const section = { ghatId: 'bor', entryPlaceId: entry.id, interiorPlaceId: variant.positions[3].id, exitPlaceId: junction.id, distanceM: sectionDistanceM, roadDemand: demand };
    const route = {
      ...structuredClone(oldRoute), id, name: `${atlas.beaches.find(beach => beach.id === oldRoute.beachId).name} via Bor - ${variant.label}`,
      kind: 'highway', primaryGhatId: 'bor', borAlignmentId: variant.id,
      sourceIds: [...new Set([...oldRoute.sourceIds, ...variant.sourceIds])], waypointIds: positions.map(position => position.placeId),
      geometry: { type: 'LineString', coordinates: geometry }, distanceM: fullRoute.distance, distanceKm: fullRoute.distance / 1000,
      durationSeconds: fullRoute.duration, durationHours: fullRoute.duration / 3600, difficulty: demand.rating, scenery: null, tollCostInr: null,
      provenance: {
        ...structuredClone(oldRoute.provenance), cacheFile, requestUrl: full.requestUrl, retrievedAt: full.retrievedAt,
        waypointPositions: positions, ghatSections: [section], roadDemand: demand,
        coverageExpansion: undefined, nearestBeachExpansion: undefined,
        borAlignment: { id: variant.id, prefixCacheFile: record.cacheName, coastalSourceRouteId: oldRoute.id, composition },
        distanceAndTime: 'Sum of complete forward-only source legs; shared Khopoli junction is explicit, not an independently optimized whole trip.',
        editorialNotes: 'Separate expressway alignment. Old-highway scenery and hill-surface elevations are not transferred to this road.',
        estimateNotes: 'Exact sum of complete forward-only OSRM legs. The common Khopoli junction is an explicit routing constraint, not a globally optimized whole-trip claim. No live traffic; scenery and toll amount not independently rated.'
      }
    };
    googleMapsUrl(route);
    const journey = journeyBreakdown(route, fullRoute.legs);
    dataset.journeys[id] = { ...journey, requestUrl: full.requestUrl, retrievedAt: full.retrievedAt, sourceLegs: composition, legEvidence: fullRoute.legs.map((leg, index) => ({ index, distanceM: leg.distance, durationSeconds: leg.duration })) };
    dataset.routes.push(route);
    variant.routeIds.push(id);
  }
}
if (!process.argv.includes('--probe')) {
  await save('data/bor-road-options.json', dataset);
  console.log(`Saved three Bor alignments, ${dataset.routes.length} new expressway itineraries, ${oldRoutes.length} old-highway destinations; legacy routes are preserved in the base snapshot.`);
}
