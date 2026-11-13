import { getTheme } from './themes.js';

export function createColorScheme(atlas) {
  const routes = new Map(atlas.routes.map(route => [route.id, route]));
  const ghatPositions = new Map(atlas.ghats.map((ghat, index) => [ghat.id, index]));
  const beachPositions = new Map(atlas.beaches.map((beach, index) => [beach.id, index]));
  return {
    routeColor(routeOrId) {
      const palette = getTheme().routePalette;
      const route = typeof routeOrId === 'string' ? routes.get(routeOrId) : routeOrId;
      if (!route) return palette[0];
      const ghatId = route.primaryGhatId ||
        route.ghatIds.find(id => route.id === `${id}-${route.beachId}`) || route.ghatIds.at(-1);
      const alignmentOffset = { 'old-highway': 0, 'expressway-missing-link': 4, 'expressway-original': 8 }[route.borAlignmentId] || 0;
      return palette[((ghatPositions.get(ghatId) || 0) + (beachPositions.get(route.beachId) || 0) + alignmentOffset) % palette.length];
    },
    placeColor(id) {
      const palette = getTheme().routePalette;
      if (ghatPositions.has(id)) return palette[(ghatPositions.get(id) + 1) % palette.length];
      if (beachPositions.has(id)) return palette[beachPositions.get(id) % palette.length];
      return getTheme().secondary;
    }
  };
}
