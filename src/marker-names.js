export function markerName(place) {
  const suffix = { 'ghat-entry': 'chosen road marker A', 'ghat-interior': 'chosen interior road marker', 'ghat-exit': 'chosen road marker B' }[place?.kind];
  if (!suffix) return place?.name || '';
  return `${place.name.replace(/\s*\u00b7\s*(plateau entry|interior anchor|Konkan exit)$/i, '')} \u00b7 ${suffix}`;
}
