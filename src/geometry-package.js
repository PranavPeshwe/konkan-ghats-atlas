import { decodePolyline6 } from './polyline6.js';

function validPoint(point) {
  return Array.isArray(point) && point.length === 2 &&
    point.every(value => Number.isFinite(value) && !Object.is(value, -0));
}

export function restoreRouteGeometries(documents, geometryPackage) {
  if (geometryPackage?.version !== 1 || !['coordinates', 'polyline6'].includes(geometryPackage.encoding) || !Array.isArray(geometryPackage.arcs)) {
    throw new Error('Unsupported route geometry package.');
  }
  const arcs = geometryPackage.encoding === 'polyline6' ? geometryPackage.arcs.map(decodePolyline6) : geometryPackage.arcs;
  for (const arc of arcs) {
    if (!Array.isArray(arc) || arc.length < 2 || !arc.every(validPoint)) throw new Error('Invalid shared route arc.');
  }
  for (const document of documents) {
    if (!Array.isArray(document?.routes)) throw new Error('Invalid route geometry document.');
    for (const route of document.routes) {
      if (Array.isArray(route.geometry?.coordinates)) continue;
      const references = route.geometry?.coordinates?.arcs;
      if (route.geometry?.type !== 'LineString' || !Array.isArray(references) || !references.length) {
        throw new Error(`Missing packed route geometry: ${route.id}`);
      }
      const coordinates = [];
      for (const reference of references) {
        // -1 reverses arc 0; joins omit only the boundary copy, not repeated road vertices.
        if (!Number.isSafeInteger(reference)) throw new Error(`Invalid arc reference: ${route.id}`);
        const index = reference < 0 ? -reference - 1 : reference;
        const arc = arcs[index];
        if (!arc) throw new Error(`Unknown arc reference: ${route.id}`);
        for (let offset = 0; offset < arc.length; offset++) {
          const point = arc[reference < 0 ? arc.length - 1 - offset : offset];
          if (offset === 0 && coordinates.length) {
            const previous = coordinates.at(-1);
            if (previous[0] !== point[0] || previous[1] !== point[1]) throw new Error(`Disconnected route arcs: ${route.id}`);
            continue;
          }
          coordinates.push([point[0], point[1]]);
        }
      }
      route.geometry.coordinates = coordinates;
    }
  }
  return documents;
}

