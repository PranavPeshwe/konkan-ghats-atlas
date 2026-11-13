const textCorrections = new Map([
  ['Difficulty is an editorial curves-only driving-demand proxy measured from road geometry; scenery is an editorial corridor preference, not a measured whole-trip landscape score. Neither is a safety assurance. Tolls remain unknown.',
    'Difficulty is an editorial curves-only driving-demand proxy measured from road geometry; scenery is an editorial corridor preference, not a measured whole-trip landscape score. Neither is a safety assurance.'],
  ['No elevation/toll measurements or whole-road safety assessment; difficulty is only a geometry-derived editorial curves proxy.',
    'No surveyed road elevations or whole-road safety assessment; difficulty is only a geometry-derived editorial curves proxy.'],
  ['Exact sum of complete forward-only OSRM legs. The common Khopoli junction is an explicit routing constraint, not a globally optimized whole-trip claim. No live traffic; scenery and toll amount not independently rated.',
    'Exact sum of complete forward-only OSRM legs. The common Khopoli junction is an explicit routing constraint, not a globally optimized whole-trip claim. No live traffic; scenery is not independently rated.']
]);

export function appData(value) {
  if (typeof value === 'string') return textCorrections.get(value) || value;
  if (Array.isArray(value)) return value.map(appData);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).filter(([key]) => !/^toll/i.test(key)).map(([key, item]) => [key, appData(item)]));
  }
  return value;
}
