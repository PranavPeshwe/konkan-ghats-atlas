import { getLanguage, onLanguageChange } from './i18n.js';
import { featureName, mapName, nameExpression, setMapNameReference } from './map-names.js';
import nameReference from '../data/maharashtra-map-names.json' with { type: 'json' };

setMapNameReference(nameReference.records);

export function installMapLabels(map) {
  const groups = new Map();
  for (const layer of map.getStyle().layers.filter(layer => layer.type === 'symbol' && layer.source === 'basemap')) {
    const sourceLayer = layer['source-layer'];
    if (!groups.has(sourceLayer)) groups.set(sourceLayer, []);
    groups.get(sourceLayer).push(layer.id);
  }
  let frame = null;
  let destroyed = false;
  const previous = new Map();
  function refresh() {
    frame = null;
    if (destroyed) return;
    const language = getLanguage();
    const localeKeys = language === 'en' ? ['name:en', 'name_en', 'name:latin', 'name_int'] : [`name:${language}`, `name_${language}`];
    const keyExpression = ['concat', nameExpression, '\u001f', ['to-string', ['coalesce', ['id'], '']], ...localeKeys.flatMap(key => ['\u001f', ['coalesce', ['get', key], '']])];
    for (const [sourceLayer, layers] of groups) {
      const labels = new Map();
      for (const feature of map.querySourceFeatures('basemap', { sourceLayer })) {
        const name = featureName(feature.properties);
        const key = name + '\u001f' + (feature.id ?? '') + localeKeys.map(key => '\u001f' + (feature.properties[key] ?? '')).join('');
        if (name) labels.set(key, mapName(feature.properties, language, feature));
      }
      const pairs = [...labels].sort(([a], [b]) => a.localeCompare(b));
      // Tile labels refresh after sourcedata; unresolved native names retain the English source spelling.
      const expression = pairs.length ? ['match', keyExpression, ...pairs.flat(), ''] : '';
      const signature = JSON.stringify(expression);
      if (signature === previous.get(sourceLayer)) continue;
      previous.set(sourceLayer, signature);
      for (const layer of layers) {
        if (map.getLayer(layer)) map.setLayoutProperty(layer, 'text-field', expression);
      }
    }
  }
  function schedule(event) {
    if (event?.sourceId && event.sourceId !== 'basemap') return;
    if (frame === null && !destroyed) frame = requestAnimationFrame(refresh);
  }
  const removeLanguageListener = onLanguageChange(refresh);
  map.on('sourcedata', schedule);
  map.on('moveend', schedule);
  refresh();
  return () => {
    destroyed = true;
    if (frame !== null) cancelAnimationFrame(frame);
    removeLanguageListener();
    map.off('sourcedata', schedule);
    map.off('moveend', schedule);
  };
}
