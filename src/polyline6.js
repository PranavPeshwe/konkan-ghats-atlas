export function decodePolyline6(encoded) {
  if (typeof encoded !== 'string') throw new Error('Invalid Polyline6 arc.');
  let position = 0, latitude = 0, longitude = 0;
  const coordinates = [];
  function readDelta() {
    let value = 0, multiplier = 1;
    for (let group = 0; group < 6; group++) {
      if (position === encoded.length) throw new Error('Truncated Polyline6 arc.');
      const piece = encoded.charCodeAt(position++) - 63;
      if (piece < 0 || piece > 63) throw new Error('Invalid Polyline6 character.');
      value += (piece & 31) * multiplier;
      if (piece < 32) return value % 2 ? -(Math.floor(value / 2) + 1) : value / 2;
      multiplier *= 32;
    }
    throw new Error('Polyline6 delta exceeds WGS84 bounds.');
  }
  while (position < encoded.length) {
    latitude += readDelta();
    longitude += readDelta();
    if (Math.abs(latitude) > 90000000 || Math.abs(longitude) > 180000000) throw new Error('Polyline6 point exceeds WGS84 bounds.');
    // Polyline6 is latitude-first on the wire; the app retains GeoJSON's longitude-first order.
    coordinates.push([longitude / 1000000, latitude / 1000000]);
  }
  return coordinates;
}
