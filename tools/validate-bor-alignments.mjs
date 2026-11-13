import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { withBorAlignments, withBorCoverage } from '../src/bor-alignments.js';
import { primaryGhat, borAlignmentId } from '../src/routes.js';
import { googleMapsUrl } from '../src/google-maps.js';
import { journeyBreakdown } from '../src/journey.js';
import { loadRouteRecord, auditResponse, haversine, simplify, drivingDemand } from './prepare-routes.mjs';
import { validateData } from './validate-data.mjs';

const load = async file => JSON.parse(await readFile(resolve(file), 'utf8'));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export async function validateBorAlignmentsFiles(base, sources, coverage) {
  const options = await load('data/bor-road-options.json');
  const atlas = withBorAlignments(base, options);
  const errors = validateData(atlas, [...sources, ...options.sources], withBorCoverage(coverage, atlas));
  const check = (condition, message) => { if (!condition) errors.push(message); };
  check(same(options.variants.map(variant => variant.id), ['old-highway', 'expressway-missing-link', 'expressway-original']), 'Missing one of the three Bor alignments');
  check(same(options.retiredRouteIds, base.routes.filter(route => route.kind === 'highway' && route.ghatIds.includes('bor')).map(route => route.id)), 'Legacy false expressway records not retired');
  check(options.routes.length === options.variants[0].routeIds.length * 2, 'Incomplete expressway beach coverage');
  const sourceWays = new Map();
  for (const reference of options.osmWayEvidence) {
    const record = await load(reference.cacheFile);
    const way = record.response.elements.find(way => way.id === reference.wayId);
    check(way?.tags.highway === 'motorway' && way.tags.oneway === 'yes', `Unaudited motorway way ${reference.wayId}`);
    sourceWays.set(reference.wayId, way);
  }
  for (const variant of options.variants) {
    check(new Set(variant.routeIds.map(id => atlas.routes.find(route => route.id === id)?.beachId)).size >= 10, `Fewer than ten destinations for ${variant.id}`);
    check(variant.routeIds.every(id => borAlignmentId(atlas.routes.find(route => route.id === id)) === variant.id), `Misclassified Bor route ${variant.id}`);
    if (!variant.prefixCacheFile) continue;
    const record = await loadRouteRecord(variant.prefixCacheFile), raw = record.response.routes[0];
    auditResponse(record);
    check(raw.distance === variant.prefixDistanceM && raw.duration === variant.prefixDurationSeconds, `Changed prefix metrics ${variant.id}`);
    const steps = raw.legs.flatMap(leg => leg.steps), missing = steps.filter(step => /Missing Link|Connecting Link/i.test(step.name || ''));
    check(variant.id === 'expressway-missing-link' ? missing.reduce((sum, step) => sum + step.distance, 0) > 9000 : missing.length === 0 && steps.some(step => /Khandala Tunnel/i.test(step.name || '')), `Wrong expressway alignment ${variant.id}`);
    const wayIds = variant.id === 'expressway-missing-link' ? [847213099, 847213087] : [22842049];
    for (const id of wayIds) {
      let previous = 0;
      for (const point of sourceWays.get(id).geometry) {
        const index = raw.geometry.coordinates.findIndex((coordinate, candidate) => candidate >= previous && haversine(coordinate, [point.lon, point.lat]) < 40);
        check(index >= 0, `Road geometry does not traverse OSM tunnel ${id}/${variant.id}`);
        if (index >= 0) previous = index;
      }
    }
  }
  for (const route of options.routes) {
    const variant = options.variants.find(variant => variant.id === route.borAlignmentId);
    const original = base.routes.find(original => original.id === route.provenance.borAlignment.coastalSourceRouteId);
    check(primaryGhat(route) === 'bor' && original?.beachId === route.beachId && variant.routeIds.includes(route.id), `Unreferenced Bor itinerary ${route.id}`);
    check(route.distanceM >= original.distanceM, `New Bor minimum requires a fresh all-beach candidate audit ${route.id}`);
    check(route.scenery === null && route.tollCostInr === null, `Unverified expressway ranking values ${route.id}`);
    const record = await loadRouteRecord(route.provenance.cacheFile), indices = auditResponse(record), raw = record.response.routes[0];
    check(route.distanceM === raw.distance && route.durationSeconds === raw.duration, `Unbacked whole-route metrics ${route.id}`);
    const geometry = indices.slice(0, -1).flatMap((a, index) => simplify(raw.geometry.coordinates.slice(a, indices[index + 1] + 1), 20).slice(index ? 1 : 0));
    check(same(route.geometry.coordinates, geometry), `Changed cached expressway geometry ${route.id}`);
    let distance = 0;
    for (const [index, position] of route.provenance.waypointPositions.entries()) {
      if (index) distance += raw.legs[index - 1].distance;
      check(position.distanceAlongM === distance && haversine(position.coordinates, record.response.waypoints[index].location) < 0.01, `Changed expressway waypoint ${route.id}/${index}`);
    }
    const section = route.provenance.ghatSections[0];
    const a = route.waypointIds.indexOf(section.entryPlaceId), z = route.waypointIds.indexOf(section.exitPlaceId);
    const metres = raw.legs.slice(a, z).reduce((sum, leg) => sum + leg.distance, 0);
    check(metres === section.distanceM && same(section.roadDemand, drivingDemand(raw.geometry.coordinates.slice(indices[a], indices[z] + 1), metres)), `Unreproduced expressway interval ${route.id}`);
    const journey = options.journeys[route.id];
    check(journey && same(journey.stages, journeyBreakdown(route, raw.legs).stages) &&
      same(journey.legEvidence, raw.legs.map((leg, index) => ({ index, distanceM: leg.distance, durationSeconds: leg.duration }))), `Unreconciled expressway journey ${route.id}`);
    check(same(record.composition, route.provenance.borAlignment.composition) && same(journey.sourceLegs, record.composition), `Unbacked expressway leg composition ${route.id}`);
    googleMapsUrl(route);
  }
  return { atlas, options, errors };
}
