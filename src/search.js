import { searchNames } from './i18n.js';

export const normalize = value => String(value ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();

export function createSearch(atlas) {
  const alignmentTokens = new Map((atlas.borAlignments?.variants || []).flatMap(variant => variant.routeIds.map(id => [id, `${variant.label} ${variant.shortLabel}`])));
  const places = [...atlas.ghats.map(entity => ({ type: 'ghats', entity })),
    ...atlas.beaches.map(entity => ({ type: 'beaches', entity })),
    ...(atlas.places || []).map(entity => ({ type: 'places', entity })),
    ...atlas.routes.map(entity => ({ type: 'routes', entity }))];
  const byId = new Map(places.map(item => [item.entity.id, item.entity]));
  const tokens = entity => normalize(searchNames([entity.name, ...(entity.aliases || []), entity.region || '', alignmentTokens.get(entity.id) || ''].join(' ')));
  const routeTokens = new Map(atlas.routes.map(route => [
    route.id, [tokens(route), tokens(byId.get(route.beachId) || {}), ...(route.ghatIds || []).map(id => tokens(byId.get(id) || {})), ...(route.waypointIds || []).map(id => tokens(byId.get(id) || {}))].join(' ')
  ]));
  const queryMatches = (text, query) => normalize(query).split(/\s+/).every(word => text.includes(word));
  return {
    byId,
    search(query) {
      if (!normalize(query)) return [];
      return places.filter(item => queryMatches(tokens(item.entity), query))
        .sort((a, b) => Number(normalize(b.entity.name) === normalize(query)) - Number(normalize(a.entity.name) === normalize(query)) || a.entity.name.localeCompare(b.entity.name));
    },
    matchesRoute(route, state) {
      const f = state.filters;
      if (state.query && !queryMatches(routeTokens.get(route.id) || '', state.query)) return false;
      if (f.maxDistance != null && (!Number.isFinite(route.distanceKm) || route.distanceKm > f.maxDistance)) return false;
      if (f.maxTime != null && (!Number.isFinite(route.durationHours) || route.durationHours > f.maxTime)) return false;
      if (f.difficulty != null && (!Number.isFinite(route.difficulty) || route.difficulty > f.difficulty)) return false;
      if (f.scenery != null && (!Number.isFinite(route.scenery) || route.scenery < f.scenery)) return false;
      return true;
    },
    focusMatches(route, focus) {
      if (!focus) return true;
      return focus.type === 'ghats' ? route.ghatIds.includes(focus.id) : route.beachId === focus.id;
    }
  };
}

