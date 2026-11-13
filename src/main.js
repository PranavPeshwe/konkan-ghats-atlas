import { createAtlasMap } from './map.js';
import { createStore } from './state.js';
import { createSearch } from './search.js';
import { createRanking } from './ranking.js';
import { createUI } from './ui.js';
import { routeView } from './routes.js';
import { applyDocumentTheme } from './themes.js';
import baseAtlas from '../data/atlas.json' with { type: 'json' };
import borOptions from '../data/bor-road-options.json';
import { withBorAlignments, withBorCoverage } from './bor-alignments.js';
import sources from '../data/sources.json';
import baseCoverage from '../data/coverage-register.json';
import baseFieldGuide from '../data/field-guide.json' with { type: 'json' };
import measurementAudit from '../data/ghat-measurement-audit.json' with { type: 'json' };
import license from '../DATA-LICENSE.txt';
import libraryNotices from '../THIRD-PARTY-NOTICES.txt';
import { installLanguages, setLanguage, getLanguage } from './i18n.js';
import routeGeometry from 'atlas:route-geometry';
import { restoreRouteGeometries } from './geometry-package.js';

restoreRouteGeometries([baseAtlas, borOptions], routeGeometry);
const atlas = withBorAlignments(baseAtlas, borOptions);
const coverage = withBorCoverage(baseCoverage, atlas);
const fieldGuide = { ...baseFieldGuide, routes: { ...baseFieldGuide.routes, ...borOptions.journeys } };
applyDocumentTheme();
const store = createStore();
const search = createSearch(atlas);
const ranking = createRanking(atlas.routes);
let map;
const guideSources = [...new Map([...sources, ...fieldGuide.sources, ...measurementAudit.sources, ...borOptions.sources].map(source => [source.id, source])).values()];
const ui = createUI({ atlas, sources: guideSources, coverage, fieldGuide, measurementAudit, license, libraryNotices, store, search, ranking, getMap: () => map });
store.subscribe(ui.render);
ui.render(store.state);
function startMap() {
  map?.destroy();
  map = createAtlasMap({
    atlas,
    onRoute(id) {
      if (!store.state.selectedIds.has(id)) store.dispatch({ type: 'toggle-route', id });
      store.dispatch({ type: 'trace-route', id });
    },
    onPlace: ui.selectEntity,
    onStatus(status, message) {
      const statusElement = document.getElementById('map-status');
      statusElement.hidden = status === 'ready' || status === 'unavailable';
      statusElement.textContent = status === 'tiles-unavailable' ? 'Basemap tiles unavailable. Local route data and comparisons still work.' : 'Loading the online basemap...';
      if (status === 'tiles-unavailable') {
        const retry = document.createElement('button');
        retry.className = 'text-button';
        retry.style.marginLeft = '10px';
        retry.textContent = 'Retry';
        retry.onclick = startMap;
        statusElement.append(retry);
      }
      document.getElementById('map-fallback').hidden = status !== 'unavailable';
      if (message) document.getElementById('map-error').textContent = message;
    }
  });
  ui.render(store.state);
}
startMap();
document.getElementById('reset-view').onclick = () => {
  store.dispatch({ type: 'focus', mode: store.state.mode, id: null });
  map.overview();
};
document.getElementById('fit-selection').onclick = () => {
  const selected = atlas.routes.filter(route => store.state.selectedIds.has(route.id));
  const focused = routeView(atlas, search, store.state).mapRoutes;
  const traced = store.state.mapView === 'route' ? atlas.routes.filter(route => route.id === store.state.hoveredId) : [];
  map.fitRoutes(traced.length ? traced : selected.length ? selected : focused);
};
document.getElementById('retry-map').onclick = startMap;
document.getElementById('reset-all').onclick = () => {
  setLanguage('en');
  applyDocumentTheme();
  store.dispatch({ type: 'reset' });
  document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
  document.querySelectorAll('details[open]').forEach(details => { details.open = false; });
  for (const selector of ['#catalog-list', '.inspector']) {
    document.querySelector(selector)?.scrollTo({ top: 0, behavior: 'instant' });
  }
  history.replaceState(null, '', location.href.split('#')[0]);
  map?.overview();
  document.getElementById('announcement').textContent = 'All settings reset. Map overview restored.';
};
window.__atlas = { atlas, fieldGuide, measurementAudit, store, ranking, search, get map() { return map; }, get language() { return getLanguage(); } };
const welcome = document.getElementById('welcome-dialog');
document.getElementById('welcome-start').onclick = () => welcome.close();
document.getElementById('close-welcome').onclick = () => welcome.close();
welcome.addEventListener('close', () => document.querySelector('#catalog-list [data-entity]')?.focus({ preventScroll: true }));
welcome.showModal();
installLanguages();
