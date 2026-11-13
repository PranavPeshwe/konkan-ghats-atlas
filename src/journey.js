export function journeyBreakdown(route, legs) {
  if (legs.length !== route.waypointIds.length - 1) throw new Error(`Incomplete journey legs: ${route.id}`);
  const sections = route.provenance.ghatSections;
  const entry = Math.min(...sections.map(section => route.waypointIds.indexOf(section.entryPlaceId)));
  const exit = Math.max(...sections.map(section => route.waypointIds.indexOf(section.exitPlaceId)));
  if (entry <= 0 || exit <= entry || exit >= legs.length) throw new Error(`Invalid journey boundaries: ${route.id}`);
  const stages = [
    { id: 'approach', label: 'Pune to chosen road marker A', start: 0, end: entry },
    { id: 'crossing', label: 'Between chosen road markers A and B', start: entry, end: exit },
    { id: 'coast', label: 'Marker B to beach (may include further descent)', start: exit, end: legs.length }
  ].map(stage => ({
    id: stage.id, label: stage.label,
    startPlaceId: route.waypointIds[stage.start], endPlaceId: route.waypointIds[stage.end],
    distanceM: legs.slice(stage.start, stage.end).reduce((sum, leg) => sum + leg.distance, 0),
    durationSeconds: legs.slice(stage.start, stage.end).reduce((sum, leg) => sum + leg.duration, 0)
  }));
  if (stages.some(stage => !Number.isFinite(stage.distanceM) || !Number.isFinite(stage.durationSeconds) || stage.distanceM <= 0 || stage.durationSeconds < 0) ||
      Math.abs(stages.reduce((sum, stage) => sum + stage.distanceM, 0) - route.distanceM) > 0.01 ||
      Math.abs(stages.reduce((sum, stage) => sum + stage.durationSeconds, 0) - route.durationSeconds) > 0.01) {
    throw new Error(`Journey totals do not reconcile: ${route.id}`);
  }
  return { routeId: route.id, cacheFile: route.provenance.cacheFile, sourceIds: ['osrm'], stages };
}
