function pointKey(point) {
  if (!Array.isArray(point) || point.length !== 2 ||
    !point.every(value => Number.isFinite(value) && !Object.is(value, -0))) {
    throw new Error('Route geometry requires exact, finite two-dimensional coordinates.');
  }
  return `${point[0]},${point[1]}`;
}

export function encodePolyline6(points) {
  let latitude = 0, longitude = 0, encoded = '';
  function writeDelta(delta) {
    let value = delta < 0 ? -delta * 2 - 1 : delta * 2;
    while (value >= 32) {
      encoded += String.fromCharCode(value % 32 + 32 + 63);
      value = Math.floor(value / 32);
    }
    encoded += String.fromCharCode(value + 63);
  }
  for (const point of points) {
    pointKey(point);
    const lat = Math.round(point[1] * 1000000), lon = Math.round(point[0] * 1000000);
    if (lat / 1000000 !== point[1] || lon / 1000000 !== point[0]) {
      throw new Error(`Polyline6 would lose source coordinate precision: ${JSON.stringify(point)}`);
    }
    if (Math.abs(lat) > 90000000 || Math.abs(lon) > 180000000) throw new Error('Polyline6 requires WGS84 coordinates.');
    writeDelta(lat - latitude); writeDelta(lon - longitude);
    latitude = lat; longitude = lon;
  }
  return encoded;
}

export function packRouteGeometries(documents, { encoding = 'coordinates' } = {}) {
  if (!['coordinates', 'polyline6'].includes(encoding)) throw new Error('Unsupported route geometry encoding.');
  const vertices = [], byPoint = new Map(), neighbors = [], cuts = new Set(), lines = new Map();
  let originalPoints = 0;
  for (const document of Object.values(documents)) {
    if (!Array.isArray(document?.routes)) throw new Error('Invalid route geometry document.');
    for (const route of document.routes) {
      const points = route.geometry?.coordinates;
      if (route.geometry?.type !== 'LineString' || !Array.isArray(points) || points.length < 2) {
        throw new Error(`Invalid source route geometry: ${route.id}`);
      }
      const line = points.map(point => {
        const key = pointKey(point);
        if (!byPoint.has(key)) {
          byPoint.set(key, vertices.length);
          vertices.push([point[0], point[1]]);
          neighbors.push(new Set());
        }
        return byPoint.get(key);
      });
      originalPoints += line.length;
      cuts.add(line[0]); cuts.add(line.at(-1));
      for (let index = 1; index < line.length; index++) {
        neighbors[line[index - 1]].add(line[index]);
        neighbors[line[index]].add(line[index - 1]);
        if (index + 1 < line.length && line[index - 1] === line[index + 1]) cuts.add(line[index]);
      }
      lines.set(route, line);
    }
  }
  // Shared chains end at branches, route endpoints and reversals; coordinates are never snapped.
  for (let index = 0; index < neighbors.length; index++) if (neighbors[index].size !== 2) cuts.add(index);

  const arcs = [], byArc = new Map();
  const packedDocuments = Object.fromEntries(Object.entries(documents).map(([name, document]) => [
    name,
    {
      ...document,
      routes: document.routes.map(route => {
        const line = lines.get(route), references = [];
        let start = 0;
        for (let end = 1; end < line.length; end++) {
          if (!cuts.has(line[end]) && end + 1 < line.length) continue;
          let sequence = line.slice(start, end + 1), reverse = false;
          for (let offset = 0; offset < sequence.length; offset++) {
            const first = sequence[offset], last = sequence[sequence.length - 1 - offset];
            if (first === last) continue;
            reverse = first > last;
            break;
          }
          if (reverse) sequence.reverse();
          const key = sequence.join(',');
          if (!byArc.has(key)) {
            byArc.set(key, arcs.length);
            arcs.push(sequence.map(index => vertices[index]));
          }
          const index = byArc.get(key);
          references.push(reverse ? -index - 1 : index);
          start = end;
        }
        return { ...route, geometry: { ...route.geometry, coordinates: { arcs: references } } };
      })
    }
  ]));
  return {
    documents: packedDocuments,
    geometryPackage: { version: 1, encoding, arcs: encoding === 'polyline6' ? arcs.map(encodePolyline6) : arcs },
    stats: {
      routes: lines.size, originalPoints, uniquePoints: vertices.length, arcs: arcs.length,
      storedArcPoints: arcs.reduce((sum, arc) => sum + arc.length, 0)
    }
  };
}
