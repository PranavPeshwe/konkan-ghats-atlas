import { Map as MapLibreMap, NavigationControl, Popup, setWorkerUrl } from 'maplibre-gl';
import style from './map-style.json';
import { createColorScheme } from './colors.js';
import { getTheme, mapThemePaint } from './themes.js';
import { installWaterLabels } from './water-labels.js';
import { installMapLabels } from './map-labels.js';
import { localizeMapText } from './map-names.js';
import { markerName } from './marker-names.js';
import { translate, onLanguageChange, getLanguage } from './i18n.js';

let workerUrl;
export function createAtlasMap({ atlas, onRoute, onPlace, onStatus }) {
  if (!workerUrl) {
    workerUrl = URL.createObjectURL(new Blob([__ATLAS_WORKER__], { type: 'text/javascript' }));
    // The bundled IIFE is a classic worker; MapLibre recognizes the .cjs suffix.
    setWorkerUrl(`${workerUrl}#atlas.cjs`);
  }
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const { routeColor, placeColor } = createColorScheme(atlas);
  let map;
  let ready = false;
  let current = null;
  let popup;
  let timeout;
  let tileError = false;
  let removeWaterLabels = () => {};
  let removeMapLabels = () => {};
  const removeLanguageListener = onLanguageChange(() => {
    popup?.remove();
    if (ready && current) update(current);
  });
  let profileId = null;
  let profileSampleKey = '';
  const coordinates = [...atlas.ghats, ...atlas.beaches, atlas.origin].map(p => p.coordinates);
  const bounds = [[Math.min(...coordinates.map(c => c[0])) - 0.15, Math.min(...coordinates.map(c => c[1])) - 0.12],
    [Math.max(...coordinates.map(c => c[0])) + 0.12, Math.max(...coordinates.map(c => c[1])) + 0.12]];
  const collection = features => ({ type: 'FeatureCollection', features });
  const pointFeatures = (items, kind) => items.map(item => ({
    type: 'Feature', properties: { id: item.id, name: localizeMapText(translate(markerName(item)), getLanguage()), kind, color: placeColor(item.id) },
    geometry: { type: 'Point', coordinates: item.coordinates }
  }));
  const initialPaint = mapThemePaint(getTheme());
  const initialStyle = {
    ...style,
    transition: { duration: 0, delay: 0 },
    layers: style.layers.map(layer => ({ ...layer, paint: { ...layer.paint, ...initialPaint[layer.id] } }))
  };
  try {
    map = new MapLibreMap({
      container: 'map',
      style: initialStyle,
      bounds,
      fitBoundsOptions: { padding: { top: 130, bottom: 110, left: 65, right: 65 } },
      attributionControl: { compact: false },
      maxZoom: 16,
      minZoom: 5,
      renderWorldCopies: false,
      dragRotate: false,
      pitchWithRotate: false,
      touchZoomRotate: false
    });
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    onStatus('loading');
    timeout = window.setTimeout(() => {
      if (!map.areTilesLoaded()) onStatus('tiles-unavailable');
    }, 14000);
    map.on('error', event => {
      console.warn('Basemap:', event.error?.message || 'Unavailable');
      tileError = true;
      onStatus(/worker failed/i.test(event.error?.message || '') ? 'unavailable' : 'tiles-unavailable');
    });
    map.once('style.load', () => {
      ready = true;
      map.addSource('atlas-routes', { type: 'geojson', data: collection([]) });
      map.addSource('atlas-places', {
        type: 'geojson',
        data: collection([...pointFeatures(atlas.ghats, 'ghat'), ...pointFeatures(atlas.beaches, 'beach'), ...pointFeatures([atlas.origin], 'origin')])
      });
      map.addSource('atlas-waypoints', { type: 'geojson', data: collection([]) });
      map.addSource('atlas-ghat-section', { type: 'geojson', data: collection([]) });
      map.addSource('atlas-elevation-cursor', { type: 'geojson', data: collection([]) });
      map.addLayer({ id: 'route-casing', type: 'line', source: 'atlas-routes', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { ...initialPaint['route-casing'], 'line-width': ['+', ['get', 'width'], 3], 'line-opacity': ['get', 'opacity'] } });
      map.addLayer({ id: 'route-lines', type: 'line', source: 'atlas-routes', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': ['get', 'width'], 'line-opacity': ['get', 'opacity'] } });
      map.addLayer({ id: 'ghat-section-halo', type: 'line', source: 'atlas-ghat-section', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { ...initialPaint['ghat-section-halo'], 'line-width': 9, 'line-opacity': 0.9 } });
      map.addLayer({ id: 'ghat-section-line', type: 'line', source: 'atlas-ghat-section', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { ...initialPaint['ghat-section-line'], 'line-width': 4, 'line-dasharray': [2, 1] } });
      removeWaterLabels = installWaterLabels(map, initialPaint);
      removeMapLabels = installMapLabels(map);
      map.addLayer({ id: 'atlas-place-circles', type: 'circle', source: 'atlas-places', paint: {
        'circle-radius': ['match', ['get', 'kind'], 'origin', 7, 'ghat', 5, 4],
        'circle-color': ['get', 'color'],
        'circle-stroke-width': 2, ...initialPaint['atlas-place-circles']
      } });
      map.addLayer({ id: 'atlas-place-labels', type: 'symbol', source: 'atlas-places', layout: {
        'text-field': ['get', 'name'], 'text-font': ['sans-serif'], 'text-size': 11,
        'text-anchor': 'left', 'text-offset': [0.8, 0], 'text-max-width': 10, 'text-padding': 6
      }, paint: { ...initialPaint['atlas-place-labels'], 'text-halo-width': 2 } });
      map.addLayer({ id: 'waypoint-circles', type: 'circle', source: 'atlas-waypoints', paint: { 'circle-radius': 3.5, ...initialPaint['waypoint-circles'], 'circle-stroke-width': 1.5 } });
      map.addLayer({ id: 'waypoint-labels', type: 'symbol', source: 'atlas-waypoints', minzoom: 8, layout: {
        'text-field': ['get', 'name'], 'text-font': ['sans-serif'], 'text-size': 10,
        'text-anchor': 'left', 'text-offset': [0.7, 0], 'text-max-width': 12
      }, paint: { ...initialPaint['waypoint-labels'], 'text-halo-width': 2 } });
      map.addLayer({ id: 'elevation-cursor', type: 'circle', source: 'atlas-elevation-cursor', paint: { ...initialPaint['elevation-cursor'], 'circle-radius': 6, 'circle-stroke-width': 2 } });
      map.on('click', 'waypoint-circles', event => {
        const point = event.features[0];
        if (!point) return;
        const content = document.createElement('div');
        const title = document.createElement('p');
        title.className = 'popup-title';
        title.textContent = point.properties.name;
        const description = document.createElement('p');
        description.className = 'popup-copy';
        description.textContent = Number.isFinite(point.properties.distanceKm)
          ? `${Math.round(point.properties.distanceKm)} km along the selected itinerary from Pune`
          : 'Waypoint on the selected itinerary';
        content.append(title, description);
        popup?.remove();
        popup = new Popup({ closeButton: true }).setLngLat(point.geometry.coordinates).setDOMContent(content).addTo(map);
      });
      const namedPlaceAt = point => map.queryRenderedFeatures(point, { layers: ['atlas-place-circles', 'atlas-place-labels'] })
        .find(feature => ['ghat', 'beach'].includes(feature.properties.kind));
      map.on('click', 'route-lines', event => {
        if (namedPlaceAt(event.point)) return;
        const route = atlas.routes.find(r => r.id === event.features[0]?.properties.id);
        if (route) onRoute(route.id);
      });
      map.on('click', event => {
        const props = namedPlaceAt(event.point)?.properties;
        if (props) onPlace(props.kind === 'ghat' ? 'ghats' : 'beaches', props.id);
      });
      for (const layer of ['route-lines', 'atlas-place-circles', 'atlas-place-labels', 'waypoint-circles']) {
        map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = ''; });
      }
      applyAppearance();
      onStatus(map.areTilesLoaded() ? 'ready' : 'loading');
      map.on('idle', () => {
        if (map.areTilesLoaded()) {
          clearTimeout(timeout);
          if (!tileError) onStatus('ready');
        }
      });
    });
    map.on('webglcontextlost', () => onStatus('unavailable', 'The browser lost its map rendering context. Route information is still available.'));
  } catch (error) {
    onStatus('unavailable', error.message);
  }

  function update(view) {
    current = view;
    if (!ready) return;
    const { visibleRoutes, selectedIds, hoveredId, focusRoutes, mapView } = view;
    const visible = new Set(visibleRoutes.map(r => r.id));
    const focused = new Set(focusRoutes.map(r => r.id));
    const hasFocus = focused.size > 0;
    const routes = atlas.routes.filter(route => {
      if (mapView === 'route' && hoveredId) return route.id === hoveredId;
      if (mapView === 'selected' && selectedIds.size) return selectedIds.has(route.id);
      return visible.has(route.id) || selectedIds.has(route.id);
    });
    routes.sort((a, b) => Number(selectedIds.has(a.id) || a.id === hoveredId) - Number(selectedIds.has(b.id) || b.id === hoveredId));
    map.getSource('atlas-routes').setData(collection(routes.map(route => ({
      type: 'Feature',
      properties: {
        id: route.id, color: routeColor(route.id),
        width: route.id === hoveredId ? 5 : selectedIds.has(route.id) ? 4 : hasFocus && focused.has(route.id) ? 2.5 : 1.6,
        opacity: route.id === hoveredId || selectedIds.has(route.id) ? 1 : !hasFocus || focused.has(route.id) ? 0.65 : 0.12
      },
      geometry: route.geometry
    }))));
    const beachColors = new Map();
    for (const route of [...focusRoutes, ...routes.filter(item => selectedIds.has(item.id))]) {
      if (!beachColors.has(route.beachId)) beachColors.set(route.beachId, routeColor(route));
    }
    const places = [...pointFeatures(atlas.ghats, 'ghat'), ...pointFeatures(atlas.beaches, 'beach'), ...pointFeatures([atlas.origin], 'origin')];
    for (const feature of places) if (beachColors.has(feature.properties.id)) feature.properties.color = beachColors.get(feature.properties.id);
    map.getSource('atlas-places').setData(collection(places));
    const route = atlas.routes.find(r => r.id === hoveredId) || routes.find(r => selectedIds.has(r.id));
    const placeIds = new Set(route?.waypointIds || []);
    const waypointFeatures = pointFeatures((atlas.places || []).filter(p => placeIds.has(p.id)), 'waypoint');
    for (const feature of waypointFeatures) {
      const position = route?.provenance?.waypointPositions?.find(point => point.placeId === feature.properties.id);
      if (Number.isFinite(position?.distanceAlongM)) feature.properties.distanceKm = position.distanceAlongM / 1000;
    }
    map.getSource('atlas-waypoints').setData(collection(waypointFeatures));
    const profile = view.profile?.status === 'available' ? view.profile : null;
    if ((profile?.ghatId || null) !== profileId) {
      profileId = profile?.ghatId || null;
      profileSampleKey = '';
      map.getSource('atlas-ghat-section').setData(collection(profile ? [{
        type: 'Feature', properties: { ghatId: profile.ghatId, routeId: profile.routeId }, geometry: profile.geometry
      }] : []));
      map.getSource('atlas-elevation-cursor').setData(collection([]));
      if (profile) showElevationPoint(profile.ghatId, 0);
    }
  }
  function showElevationPoint(ghatId, index) {
    const profile = current?.profile;
    if (!ready || profile?.status !== 'available' || profile.ghatId !== ghatId || !profile.samples[index]) return;
    const key = `${ghatId}:${index}`;
    if (key === profileSampleKey) return;
    profileSampleKey = key;
    const sample = profile.samples[index];
    map.getSource('atlas-elevation-cursor').setData(collection([{
      type: 'Feature', properties: { ghatId, index, elevationM: sample.elevationM, distanceM: sample.distanceM },
      geometry: { type: 'Point', coordinates: sample.coordinates }
    }]));
  }
  function applyAppearance() {
    if (!ready) return;
    const theme = getTheme();
    for (const [layer, properties] of Object.entries(mapThemePaint(theme))) {
      if (!map.getLayer(layer)) continue;
      for (const [property, value] of Object.entries(properties)) map.setPaintProperty(layer, property, value);
    }
    if (current) update(current);
  }
  function fitRoutes(routes) {
    if (!map || !routes.length) return;
    const extent = [[Infinity, Infinity], [-Infinity, -Infinity]];
    for (const route of routes) for (const point of route.geometry.coordinates) {
      extent[0][0] = Math.min(extent[0][0], point[0]);
      extent[0][1] = Math.min(extent[0][1], point[1]);
      extent[1][0] = Math.max(extent[1][0], point[0]);
      extent[1][1] = Math.max(extent[1][1], point[1]);
    }
    if (!Number.isFinite(extent[0][0])) return;
    map.fitBounds(extent,
    { padding: { top: 130, bottom: 115, left: 60, right: 60 }, duration: reduced ? 0 : 650, maxZoom: 12 });
  }
  function overview() {
    popup?.remove();
    map?.fitBounds(bounds, { padding: { top: 130, bottom: 110, left: 65, right: 65 }, bearing: 0, pitch: 0, duration: reduced ? 0 : 650 });
  }
  function focusPoint(coordinates) {
    map?.easeTo({ center: coordinates, zoom: 9.5, duration: reduced ? 0 : 650 });
  }
  return {
    update, fitRoutes, overview, focusPoint, showElevationPoint,
    destroy() { clearTimeout(timeout); removeMapLabels(); removeWaterLabels(); removeLanguageListener(); popup?.remove(); map?.remove(); },
    get raw() { return map; },
    get ready() { return ready; }
  };
}
