const coordinate = point => `${point[1].toFixed(6)},${point[0].toFixed(6)}`;

export function googleMapsUrl(route) {
  const geometry = route.geometry.coordinates;
  const positions = route.provenance?.waypointPositions || [];
  const intermediate = positions.slice(1, -1);
  const requiredIds = new Set((route.provenance?.ghatSections || []).flatMap(section =>
    [section.entryPlaceId, section.interiorPlaceId, section.exitPlaceId]));
  const required = intermediate.filter(position => requiredIds.has(position.placeId) || position.role === 'junction');
  if (required.length > 9) throw new RangeError(`Route ${route.id} exceeds Google's nine intermediate-waypoint limit`);
  const selected = new Set(required);
  for (const position of intermediate) {
    if (selected.size === 9) break;
    selected.add(position);
  }
  const waypoints = intermediate.filter(position => selected.has(position));
  const url = new URL('https://maps.google.com/maps/dir/');
  url.searchParams.set('api', '1');
  url.searchParams.set('origin', coordinate(geometry[0]));
  url.searchParams.set('destination', coordinate(geometry.at(-1)));
  url.searchParams.set('travelmode', 'driving');
  url.searchParams.set('avoid', 'ferries');
  if (waypoints.length) url.searchParams.set('waypoints', waypoints.map(position => coordinate(position.coordinates)).join('|'));
  if (url.href.length > 2048) throw new RangeError(`Route ${route.id} exceeds Google's directions-URL limit`);
  return url.href;
}
