export const criteria = [
  { key: 'time', field: 'durationHours', label: 'Driving time', direction: -1 },
  { key: 'distance', field: 'distanceKm', label: 'Distance', direction: -1 },
  { key: 'scenery', field: 'scenery', label: 'Scenery', direction: 1 },
  { key: 'difficulty', field: 'difficulty', label: 'Fewer bends', direction: -1 }
];

export function createRanking(allRoutes) {
  const groups = new Map();
  for (const route of allRoutes) {
    if (!groups.has(route.beachId)) groups.set(route.beachId, []);
    groups.get(route.beachId).push(route);
  }
  const limits = new Map([...groups].map(([id, routes]) => [id, Object.fromEntries(criteria.map(criterion => {
    const values = routes.map(route => route[criterion.field]).filter(Number.isFinite);
    return [criterion.key, { min: Math.min(...values), max: Math.max(...values) }];
  }))]));
  function score(route, weights) {
    const active = criteria.filter(c => Number.isFinite(weights[c.key]) && weights[c.key] > 0);
    if (!active.length) return { score: null, status: 'disabled', missing: [], contributions: [] };
    const missing = active.filter(c => !Number.isFinite(route[c.field])).map(c => c.label);
    if (missing.length) return { score: null, status: 'incomplete', missing, contributions: [] };
    const weightSum = active.reduce((sum, c) => sum + weights[c.key], 0);
    const contributions = active.map(c => {
      const { min, max } = limits.get(route.beachId)[c.key];
      const benefit = max === min ? 1 : c.direction === 1 ? (route[c.field] - min) / (max - min) : (max - route[c.field]) / (max - min);
      return { key: c.key, label: c.label, points: 100 * benefit * weights[c.key] / weightSum, weight: weights[c.key] };
    });
    return { score: contributions.reduce((sum, item) => sum + item.points, 0), status: 'complete', missing: [], contributions };
  }
  return {
    score,
    rank(routes, weights) {
      const results = routes.map(route => ({ route, ...score(route, weights) }));
      return results.sort((a, b) => a.route.beachId.localeCompare(b.route.beachId) ||
        Number(b.status === 'complete') - Number(a.status === 'complete') ||
        (b.score ?? -1) - (a.score ?? -1) || a.route.id.localeCompare(b.route.id));
    }
  };
}
