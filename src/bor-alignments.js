import { primaryGhat, shortestByGhat, shortestByBeach, sortByDistance, borAlignmentId } from './routes.js';
import { criteria } from './ranking.js';

export function withBorAlignments(base, options) {
  const retired = new Set(options.retiredRouteIds);
  const routes = base.routes.filter(route => !retired.has(route.id)).concat(options.routes);
  const ghats = base.ghats.map(ghat => {
    if (ghat.id !== 'bor') return ghat;
    const nearest = sortByDistance(shortestByBeach(routes.filter(route => primaryGhat(route) === 'bor'))).slice(0, 10);
    return {
      ...ghat, nearestBeachIds: nearest.map(route => route.beachId),
      description: 'Three separate road choices connect Pune through the Bor/Khandala corridor: old NH48 through Lonavala and Khandala, the original Mumbai-Pune Expressway alignment, and the expressway with the Missing Link tunnels. Pune approaches and onward coastal connectors remain part of each full itinerary. Bor is not Varandha near Bhor town.',
      sourceIds: [...new Set([...ghat.sourceIds, ...options.sources.map(source => source.id)])],
      measurementNotes: `${ghat.measurementNotes} Legacy ghat-level terrain and bend-demand values refer only to old NH48. Expressway alternatives have separate route metrics; surface heights are not tunnel road-deck elevations.`
    };
  });
  const beaches = base.beaches.map(beach => ({
    ...beach, shortestGhatIds: shortestByGhat(routes.filter(route => route.beachId === beach.id)).slice(0, 5).map(primaryGhat)
  }));
  const normalizationBounds = Object.fromEntries(beaches.map(beach => [beach.id, Object.fromEntries(
    criteria.map(({ field: key }) => {
      const values = routes.filter(route => route.beachId === beach.id).map(route => route[key]).filter(Number.isFinite);
      return [key, values.length ? { min: Math.min(...values), max: Math.max(...values) } : null];
    })
  )]));
  return {
    ...base, ghats, beaches, routes, places: [...base.places, ...options.places], borAlignments: options,
    retiredRoutes: base.routes.filter(route => retired.has(route.id)),
    methodology: {
      ...base.methodology, normalizationBounds,
      nearestBeaches: {
        ...base.methodology.nearestBeaches,
        retainedRoutes: base.methodology.nearestBeaches.retainedRoutes.filter(route => !retired.has(route.routeId)),
        retiredPreservedRoutes: base.methodology.nearestBeaches.retainedRoutes.filter(route => retired.has(route.routeId))
      }
    }
  };
}

export function borVariant(atlas, route) {
  return atlas.borAlignments?.variants.find(variant => variant.id === borAlignmentId(route));
}

export function withBorCoverage(coverage, atlas) {
  return {
    ...coverage,
    completeness: `The active snapshot has ${atlas.ghats.length} documented corridors, ${atlas.beaches.length} beach arrivals and ${atlas.routes.length} itineraries. Bor has three separately audited road alignments. This is a finite curated road-network snapshot, not exhaustive route discovery or live access verification.`,
    destinationCoverage: { ...coverage.destinationCoverage, activeRouteCount: atlas.routes.length },
    candidates: coverage.candidates.map(candidate => candidate.id === 'bor' ? {
      ...candidate, routeIds: atlas.routes.filter(route => primaryGhat(route) === 'bor').map(route => route.id),
      sourceIds: [...new Set([...candidate.sourceIds, ...atlas.borAlignments.sources.map(source => source.id)])],
      rationale: `${candidate.rationale} Old NH48, expressway with Missing Link and expressway without Missing Link are separate alternatives; the three legacy false expressway detours are retired.`
    } : candidate)
  };
}
