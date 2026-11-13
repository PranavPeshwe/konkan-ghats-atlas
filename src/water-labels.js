import { getLanguage, onLanguageChange, translate } from './i18n.js';

const waterName = ['case', ...['name:en', 'name_en', 'name:latin', 'name_int', 'name'].flatMap(key =>
  [['!=', ['coalesce', ['get', key], ''], ''], ['to-string', ['get', key]]]), ''];
const text = {
  'text-field': waterName, 'text-font': ['sans-serif'],
  'text-size': ['interpolate', ['linear'], ['zoom'], 5, 11, 14, 14],
  'text-padding': 3, 'text-max-width': 12
};

const layers = [
  {
    id: 'water-body-labels', type: 'symbol', source: 'basemap', 'source-layer': 'water_name',
    filter: ['==', ['geometry-type'], 'LineString'],
    layout: { ...text, 'symbol-placement': 'line-center', 'text-rotation-alignment': 'viewport' }
  },
  {
    id: 'water-point-labels', type: 'symbol', source: 'basemap', 'source-layer': 'water_name',
    filter: ['==', ['geometry-type'], 'Point'],
    layout: { ...text, 'text-size': ['interpolate', ['linear'], ['zoom'], 5, 14, 14, 17], 'text-letter-spacing': 0.06 }
  },
  {
    id: 'waterway-labels', type: 'symbol', source: 'basemap', 'source-layer': 'waterway',
    layout: {
      ...text, 'symbol-placement': 'line', 'symbol-spacing': 350, 'text-max-angle': 45,
      'text-size': ['interpolate', ['linear'], ['zoom'], 5, 10, 14, 12]
    }
  },
  {
    id: 'coastal-sea-label', type: 'symbol', source: 'atlas-coastal-sea',
    layout: { ...text, 'text-field': ['get', 'name'], 'text-size': 16, 'text-letter-spacing': 0.12 }
  }
];

export function waterLabelPaint(theme) {
  return Object.fromEntries(layers.map(layer => [layer.id, {
    'text-color': theme.ink,
    'text-halo-color': layer.id === 'waterway-labels' ? theme.land : theme.water,
    'text-halo-width': 1.8, 'text-halo-blur': 0.4
  }]));
}

export function installWaterLabels(map, paint) {
  const collection = features => ({ type: 'FeatureCollection', features });
  map.addSource('atlas-coastal-sea', { type: 'geojson', data: collection([]) });
  for (const layer of layers) map.addLayer({ ...layer, paint: paint[layer.id] });
  let lastPosition;
  function updateSeaLabel() {
    if (!map.getLayer('water') || !map.getSource('atlas-coastal-sea')) return;
    const { width, height } = map.getCanvas().getBoundingClientRect();
    let position;
    // The basemap's Arabian Sea name point is far offshore, outside coastal views.
    for (const y of [0.52, 0.38, 0.66, 0.26, 0.78]) {
      for (const x of [0.23, 0.15, 0.4, 0.6, 0.75]) {
        const pixel = [width * x, height * y];
        const point = map.unproject(pixel);
        if (point.lng < 69 || point.lng > 74.8 || point.lat < 14 || point.lat > 20.5) continue;
        if (map.queryRenderedFeatures(pixel, { layers: ['water'] }).some(feature => feature.properties.class === 'ocean')) {
          position = point.toArray();
          break;
        }
      }
      if (position) break;
    }
    const key = JSON.stringify([position, getLanguage()]);
    if (key === lastPosition) return;
    lastPosition = key;
    map.getSource('atlas-coastal-sea').setData(collection(position ? [{
      type: 'Feature', properties: { name: translate('Arabian Sea') },
      geometry: { type: 'Point', coordinates: position }
    }] : []));
  }
  map.on('moveend', updateSeaLabel);
  map.on('idle', updateSeaLabel);
  const removeLanguageListener = onLanguageChange(updateSeaLabel);
  updateSeaLabel();
  return () => {
    map.off('moveend', updateSeaLabel);
    map.off('idle', updateSeaLabel);
    removeLanguageListener();
  };
}

