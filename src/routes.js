export const GHAT_BEACH_LIMIT = 10;
export const BEACH_GHAT_LIMIT = 5;

export function sortByDistance(routes) {
  return [...routes].sort((a, b) => a.distanceKm - b.distanceKm || a.id.localeCompare(b.id));
}

export function shortestByBeach(routes) {
  const choices = new Map();
  for (const route of sortByDistance(routes)) {
    if (!choices.has(route.beachId)) choices.set(route.beachId, route);
  }
  return [...choices.values()];
}

export function primaryGhat(route) {
  return route.primaryGhatId || route.ghatIds.find(id => route.id === `${id}-${route.beachId}`) || route.ghatIds.at(-1);
}

export function borAlignmentId(route) {
  return route.borAlignmentId || (primaryGhat(route) === 'bor' && route.kind === 'ghat' ? 'old-highway' : null);
}

export function shortestByGhat(routes) {
  const choices = new Map();
  for (const route of sortByDistance(routes)) {
    const ghat = primaryGhat(route);
    if (!choices.has(ghat)) choices.set(ghat, route);
  }
  return [...choices.values()];
}

export function routeView(atlas, search, state) {
  const filtered = atlas.routes.filter(route => search.matchesRoute(route, state));
  const candidates = state.focus ? atlas.routes.filter(route => search.focusMatches(route, state.focus)) : [];
  let focusRoutes = [];
  if (state.focus?.type === 'ghats') {
    const ghat = atlas.ghats.find(item => item.id === state.focus.id);
    focusRoutes = shortestByBeach(candidates);
    if (ghat.nearestBeachIds?.length) focusRoutes = focusRoutes.filter(route => ghat.nearestBeachIds.includes(route.beachId));
    focusRoutes = focusRoutes.slice(0, GHAT_BEACH_LIMIT);
    if (ghat.id === 'bor' && atlas.borAlignments) {
      const beaches = new Set(focusRoutes.map(route => route.beachId));
      focusRoutes = sortByDistance(candidates.filter(route => beaches.has(route.beachId) &&
        (state.borAlignment === 'all' || !state.borAlignment || borAlignmentId(route) === state.borAlignment)));
    }
  } else if (state.focus?.type === 'beaches') {
    const beach = atlas.beaches.find(item => item.id === state.focus.id);
    focusRoutes = shortestByGhat(candidates);
    if (beach.shortestGhatIds?.length) focusRoutes = focusRoutes.filter(route => beach.shortestGhatIds.includes(primaryGhat(route)));
    focusRoutes = focusRoutes.slice(0, BEACH_GHAT_LIMIT);
    if (atlas.borAlignments && focusRoutes.some(route => primaryGhat(route) === 'bor')) {
      focusRoutes = sortByDistance([...focusRoutes.filter(route => primaryGhat(route) !== 'bor'),
        ...candidates.filter(route => primaryGhat(route) === 'bor')]);
    }
  }
  const displayed = state.focus
    ? focusRoutes.filter(route => search.matchesRoute(route, state))
    : [];
  return {
    filtered, displayed, focusRoutes,
    mapRoutes: displayed
  };
}
