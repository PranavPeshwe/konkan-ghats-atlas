import { createColorScheme } from './colors.js';
import { normalize } from './search.js';
import { criteria } from './ranking.js';
import { routeView, sortByDistance, primaryGhat, shortestByGhat, borAlignmentId, GHAT_BEACH_LIMIT, BEACH_GHAT_LIMIT } from './routes.js';
import { googleMapsUrl } from './google-maps.js';
import { paletteSources } from './themes.js';
import { createFieldGuideViews } from './field-guide.js';
import { markerName } from './marker-names.js';
import { borVariant } from './bor-alignments.js';
import { localizeDocument, searchNames } from './i18n.js';
import mapNameReference from '../data/maharashtra-map-names.json' with { type: 'json' };

export const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const round = value => Number.isFinite(value) ? Math.round(value).toLocaleString('en-IN') : 'Unknown';
const time = value => {
  if (!Number.isFinite(value)) return 'Unknown';
  const mins = Math.round(value * 60 / 5) * 5;
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`;
};
const rating = value => Number.isFinite(value) ? `${value} / 5` : 'Not rated';
const safeUrl = value => {
  try { const url = new URL(value); return /^https?:$/.test(url.protocol) ? esc(url.href) : ''; } catch { return ''; }
};

export function createUI({ atlas, sources, coverage, fieldGuide, measurementAudit, license, libraryNotices, store, search, ranking, getMap }) {
  const $ = id => document.getElementById(id);
  const { routeColor, placeColor } = createColorScheme(atlas);
  const allPlaces = new Map([...atlas.ghats, ...atlas.beaches, ...atlas.places, atlas.origin].map(p => [p.id, p]));
  const sourceRows = Array.isArray(sources) ? sources : sources.sources || [];
  const bySource = new Map(sourceRows.map(source => [source.id, source]));
  const directions = new Map(atlas.routes.map(route => [route.id, googleMapsUrl(route)]));
  const defaultWeightNote = $('weight-note').textContent;
  let detailKey = '';
  let previousState;
  const guideViews = createFieldGuideViews({ atlas, fieldGuide, measurementAudit, sources: sourceRows, esc, sourceLinks, getMap, download });
  function sourceLinks(ids) {
    return [...new Set(ids || [])].map(id => {
      const source = bySource.get(id);
      if (!source) return esc(id);
      const url = safeUrl(source.url);
      return url ? `<a href="${url}" data-original-source lang="en" target="_blank" rel="noopener noreferrer">${esc(source.title || id)}</a>` : esc(source.title || id);
    }).join(' &middot; ');
  }
  function renderCatalog(state, visibleRoutes) {
    const items = state.mode === 'ghats' ? atlas.ghats : atlas.beaches;
    const query = normalize(state.query);
    const relevantIds = new Set(visibleRoutes.flatMap(r => state.mode === 'ghats' ? r.ghatIds : [r.beachId]));
    const hasFilters = Object.values(state.filters).some(value => value != null);
    const shown = items.filter(item => (!hasFilters || relevantIds.has(item.id)) &&
      (!query || normalize(searchNames([item.name, item.region, ...(item.aliases || [])].join(' '))).includes(query) || relevantIds.has(item.id)));
    $('catalog-count').textContent = `${shown.length} ${state.mode === 'ghats' ? 'crossings' : 'destinations'} · north to south`;
    $('catalog-list').innerHTML = shown.length ? shown.map(item => {
      const connectionLabel = state.mode === 'ghats' ? `${GHAT_BEACH_LIMIT} nearest beaches` : `${BEACH_GHAT_LIMIT} shortest ghats`;
      return `<button class="catalog-item ${state.focus?.id === item.id ? 'active' : ''}" style="--item-color:${placeColor(item.id)}" data-entity="${esc(item.id)}" data-kind="${state.mode}" aria-pressed="${state.focus?.id === item.id}"><span class="item-number">${String(items.indexOf(item) + 1).padStart(2, '0')}</span><span><span class="item-name">${esc(item.name)}</span><span class="item-meta">${esc(item.region)} &middot; ${connectionLabel}</span></span><span class="item-arrow" aria-hidden="true">&#8599;</span></button>`;
    }).join('') : '<p class="empty-state">No matches here. Try a broader search or reset your filters.</p>';
    for (const button of document.querySelectorAll('[data-mode]')) {
      const active = button.dataset.mode === state.mode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    }
    const results = search.search(state.query).slice(0, 12);
    $('search-results').hidden = !query;
    $('search-results').innerHTML = results.length ? results.map(result =>
      `<button class="search-result" data-result="${esc(result.entity.id)}" data-kind="${result.type}"><span>${esc(markerName(result.entity))}</span><small>${({ ghats: 'Crossing', beaches: 'Beach', places: 'Waypoint', routes: 'Route' })[result.type]}${result.entity.region ? ` &middot; ${esc(result.entity.region)}` : ''}</small></button>`).join('') : '<p class="empty-state">No named places match. Routes below may still match the query.</p>';
  }
  function renderDetail(state) {
    const key = state.focus ? `${state.focus.type}:${state.focus.id}${state.focus.id === 'bor' ? `:${state.borAlignment}` : ''}` : 'overview';
    if (key === detailKey) return;
    detailKey = key;
    const entity = state.focus ? allPlaces.get(state.focus.id) : null;
    if (!entity) {
      $('detail-content').innerHTML = `<span class="eyebrow">FROM THE DECCAN TO THE SEA</span><h2 id="detail-heading">The journey is<br>part of the destination.</h2><p class="detail-intro">Follow the roads that cross the Sahyadris. Explore a ghat, trace its coastal connections, and compare the tradeoffs.</p><div class="detail-stats"><div><span class="stat-value">${atlas.ghats.length}</span><span class="stat-label">crossings mapped</span></div><div><span class="stat-value">${atlas.beaches.length}</span><span class="stat-label">coastal destinations</span></div><div><span class="stat-value">${atlas.routes.length}</span><span class="stat-label">researched routes</span></div></div><span class="badge">Maharashtra + Goa</span><span class="badge warm">Snapshot, not live routing</span><p class="detail-note">Start with a crossing on the left. Add routes with their checkboxes, then open Compare to tune your priorities.</p><details><summary>Coverage &amp; source confidence</summary><h3 id="coverage-summary-heading">What this atlas covers</h3><p>${esc(coverage.completeness || atlas.methodology?.coverage || 'See the research register for scope and exclusions.')}</p><button class="text-button" data-about>View the research register</button></details>`;
      $('map-eyebrow').textContent = 'THE BIG PICTURE';
      $('map-heading').textContent = 'Across the Sahyadris';
      return;
    }
    const ghat = state.focus.type === 'ghats';
    const bor = ghat && entity.id === 'bor' && atlas.borAlignments;
    const routes = routeView(atlas, search, state).focusRoutes;
    const destinations = new Set(routes.map(route => route.beachId));
    const measurement = ghat ? measurementAudit.ghats[entity.id] : null;
    const publishedLength = measurement?.references.find(reference => reference.scope === 'approximate-ghat-road');
    $('map-eyebrow').textContent = ghat ? 'A CROSSING, MANY POSSIBILITIES' : 'YOUR DESTINATION';
    $('map-heading').textContent = entity.name;
    const stats = ghat
      ? [
          [publishedLength ? `\u2248 ${publishedLength.distanceM / 1000} km` : 'Unverified', 'published ghat-only estimate'],
          [bor ? '3' : `${(measurement.modelSectionDistanceM / 1000).toFixed(1)} km`, bor ? 'distinct road alignments' : 'sampled road only, not full ghat'],
          [destinations.size, 'nearest beaches']
        ]
      : [
          [routes.length, 'route alternatives'],
          [new Set(routes.map(primaryGhat)).size, 'shortest ghats'],
          [round(Math.min(...routes.map(r => r.distanceKm))), 'shortest mapped km']
        ];
    const driving = ghat ? `
      <details>
        <summary>Driving character &amp; seasonal notes</summary>
        <h3 id="driving-${esc(entity.id)}">Driving character</h3>
        <p>${esc(entity.drivingNotes || entity.accessNotes || 'No current road-surface survey is available.')}</p>
        <p>${esc(entity.roadDemand?.notes || '')}</p>
        <h3 id="season-${esc(entity.id)}">Seasonal context</h3>
        <p>${esc(entity.seasonalNotes)}</p><p>${esc(entity.measurementNotes)}</p>
      </details>` : '';
    $('detail-content').innerHTML = `
      <span class="eyebrow">${ghat ? 'THE MOUNTAIN CROSSING' : 'AT THE EDGE OF THE ARABIAN SEA'}</span>
      <h2 id="detail-${esc(entity.id)}">${esc(entity.name)}</h2>
      <div class="region-line">${esc(entity.region)}</div>
      <p class="detail-intro" style="margin-top:13px">${esc(entity.summary)}</p>
      <div class="detail-stats">${stats.map(([value, label]) => `<div><span class="stat-value${value === 'Unknown' ? ' unknown-stat' : ''}">${esc(value)}</span><span class="stat-label">${label}</span></div>`).join('')}</div>
      ${ghat && (!bor || state.borAlignment === 'old-highway') ? `<span class="badge">Scenery ${rating(entity.scenery)}</span><span class="badge warm" title="Curves-only editorial proxy for the chosen-marker interval, not a complete-ghat assessment or road-safety rating">Bend demand ${rating(entity.difficulty)}</span>` : `<span class="badge">${bor ? 'Variant-specific metrics below' : 'Fixed road-access arrival'}</span>`}
      <p class="detail-note">${esc(ghat ? entity.description : entity.arrivalNotes)}</p>
      ${bor ? `<section class="bor-alignments"><h3 id="bor-alignments-heading">Three roads across Bor</h3><div class="bor-alignment-controls" role="group" aria-label="Bor road alignment">
        <button data-bor-alignment="all" aria-pressed="${state.borAlignment === 'all'}">View all three</button>
        ${atlas.borAlignments.variants.map(variant => `<button data-bor-alignment="${variant.id}" aria-pressed="${state.borAlignment === variant.id}" style="--variant-color:${routeColor(variant.routeIds[0])}"><span class="route-swatch" style="--route-color:${routeColor(variant.routeIds[0])}"></span>${esc(variant.label)}</button>`).join('')}
        </div><p class="field-method">One ghat corridor, three road choices. Compare the same ten beaches, together or one alignment at a time. Distances and times below cover Pune to the beach.</p>
        <p class="field-method">${esc(atlas.borAlignments.terrainPolicy)}</p>
        <details><summary>Alignment evidence &amp; limits</summary><h3 id="bor-alignment-evidence">Verified road alignments</h3><p>${esc(atlas.borAlignments.scope)}</p><p>${esc(atlas.borAlignments.retirementReason)}</p><p>${sourceLinks(atlas.borAlignments.sources.map(source => source.id))}</p></details></section>` : ''}
      ${ghat ? guideViews.auditPanel(entity.id) + (!bor || state.borAlignment === 'old-highway' ? guideViews.profilePanel(entity.id) : '<p class="field-unknown">Choose Old Pune-Mumbai highway to inspect its terrain chart. No tunnel road-deck elevation profile is claimed.</p>') : ''}
      ${driving}
      ${ghat ? guideViews.storiesPanel(entity.id) : ''}
      <details>
        <summary>Sources &amp; research notes</summary>
        <h3 id="sources-${esc(entity.id)}">Source references</h3>
        <p>${sourceLinks(entity.sourceIds)}</p>
        <p>Bundled research: ${esc(atlas.researchDate)}. No live access or road-condition check.</p>
      </details>`;
  }
  function routeCard(route, state, matches, rank) {
    const selected = state.selectedIds.has(route.id);
    const names = route.waypointIds.map(id => allPlaces.get(id)?.name).filter(Boolean);
    const beach = allPlaces.get(route.beachId);
    const variant = borVariant(atlas, route);
    const title = state.focus?.type === 'ghats' ? `${beach.name}${variant ? ` \u00b7 ${variant.shortLabel}` : ''}` : `${route.name}${variant?.id === 'old-highway' ? ' \u00b7 Old NH48' : ''}`;
    return `<article class="route-card ${selected ? 'selected' : ''} ${!matches ? 'filtered' : ''}" data-route-card="${esc(route.id)}" data-distance="${route.distanceKm}" data-beach="${esc(route.beachId)}" data-alignment="${esc(variant?.id || '')}" data-current="${matches}" style="--route-color:${routeColor(route)}"><div class="route-kind"><span>${matches ? `#${rank} &middot; ` : ''}${route.kind === 'highway' ? 'HIGHWAY ALTERNATIVE' : 'GHAT CORRIDOR'}</span>${matches && rank === 1 ? '<span class="nearest-pill">SHORTEST</span>' : ''}</div><div class="route-card-header"><h3>${esc(title)}</h3><input class="route-checkbox" type="checkbox" data-select="${esc(route.id)}" aria-label="Compare ${esc(route.name)}" ${selected ? 'checked' : ''}></div><div class="route-metrics"><span class="distance-pill">${round(route.distanceKm)} <small>km</small></span><span>&asymp; ${time(route.durationHours)}</span></div><div class="route-stops">${esc(names.slice(1, -1).filter(name => !/anchor|entry|exit/i.test(name)).slice(0, 3).join('  →  ') || route.ghatIds.map(id => allPlaces.get(id)?.name || id).join(' → '))}</div>${!matches ? '<div class="route-note">Selected alternative retained outside this shortlist or your current filters.</div>' : ''}${guideViews.journeyPanel(route.id)}<details><summary>Waypoints &amp; source notes</summary><ol>${route.waypointIds.map(id => {
      const place = allPlaces.get(id);
      const position = route.provenance?.waypointPositions?.find(p => p.placeId === id);
      return `<li>${esc(markerName(place) || id)}${Number.isFinite(position?.distanceAlongM) ? ` <span class="muted">(${round(position.distanceAlongM / 1000)} km from Pune)</span>` : ''}</li>`;
    }).join('')}</ol><p>Scenery: ${rating(route.scenery)} &middot; Bend demand (curves only): ${rating(route.difficulty)}</p><p>${esc(route.provenance?.estimateNotes || 'Model estimate, not live traffic. Stops are excluded.')}</p><p>${esc(route.provenance?.editorialNotes || '')}</p><p>${sourceLinks(route.sourceIds)}</p></details><div class="route-card-actions">${!matches ? `<button class="text-button" data-reveal="${esc(route.id)}">Reveal &amp; clear filters</button>` : ''}<button class="text-button" data-fit="${esc(route.id)}">Trace on map &#8599;</button><a class="text-button google-maps-link" data-google-route="${esc(route.id)}" href="${esc(directions.get(route.id))}" target="_blank" rel="noopener noreferrer" aria-label="Open ${esc(route.name)} in Google Maps in a new tab">Google Maps &#8599;</a></div>${selected ? '<p class="route-external-note">Pune to the beach via this ghat and its route anchors. Google Maps recalculates roads and times.</p>' : ''}</article>`;
  }
  function renderRoutes(state, visibleRoutes, focusedRoutes) {
    const shownIds = new Set(focusedRoutes.map(r => r.id));
    const retained = atlas.routes.filter(route => state.selectedIds.has(route.id) && !shownIds.has(route.id));
    const rows = sortByDistance([...retained, ...focusedRoutes]);
    $('visible-route-count').textContent = `${focusedRoutes.length}${state.focus?.type === 'ghats' ? ' nearest' : ''}${retained.length ? ` + ${retained.length} retained` : ''}`;
    $('route-order-note').textContent = state.focus?.type === 'ghats' && state.focus.id === 'bor'
      ? `${GHAT_BEACH_LIMIT} beaches \u00b7 ${state.borAlignment === 'all' ? 'three road alignments' : atlas.borAlignments.variants.find(variant => variant.id === state.borAlignment)?.shortLabel} \u00b7 whole-trip distance, shortest first`
      : state.focus?.type === 'ghats'
      ? `${GHAT_BEACH_LIMIT} nearest of ${atlas.beaches.length} catalogued beaches · model driving distance · shortest first`
      : state.focus?.type === 'beaches'
        ? `${BEACH_GHAT_LIMIT} shortest distinct ghats${focusedRoutes.some(route => borAlignmentId(route)) ? ' (including three Bor road options)' : ''} · model driving distance from Pune · shortest first`
        : 'Choose a ghat or beach to reveal its routes.';
    const empty = state.focus
      ? '<div class="empty-state"><strong>A little too specific?</strong>No shortlisted routes match this combination. Broaden the filters or choose another crossing.<br><br><button class="text-button" data-reset>Reset filters</button></div>'
      : '<div class="empty-state"><strong>Click a ghat or beach to get started.</strong>Choose a name in the list or on the map to reveal its routes.</div>';
    $('route-list').innerHTML = rows.length ? rows.map(route => routeCard(route, state, shownIds.has(route.id), focusedRoutes.indexOf(route) + 1)).join('') : empty;
    $('selection-count').textContent = state.selectedIds.size;
    const selectedRoutes = atlas.routes.filter(r => state.selectedIds.has(r.id));
    const legendRoutes = selectedRoutes.length ? selectedRoutes : state.focus?.type === 'ghats' ? focusedRoutes : [];
    $('map-legend').innerHTML = (legendRoutes.length ? '<span class="legend-title">ROUTE COLOURS</span>' : '') + legendRoutes.map(route => `<button class="legend-item" style="--route-color:${routeColor(route)}" data-fit="${esc(route.id)}"><span class="route-swatch"></span>${esc(selectedRoutes.length ? route.name : `${allPlaces.get(route.beachId)?.name}${borVariant(atlas, route) ? ` \u00b7 ${borVariant(atlas, route).shortLabel}` : ''}`)}${!visibleRoutes.includes(route) ? ' (filtered)' : ''}</button>`).join('') +
      (state.focus?.type === 'ghats' && (state.focus.id !== 'bor' || state.borAlignment === 'old-highway') ? '<span class="legend-title">Highlighted sample road: ghat limits unverified</span>' : '');
  }
  function renderComparison(state) {
    $('comparison').hidden = !state.comparisonOpen;
    if (!state.comparisonOpen) return;
    const selected = atlas.routes.filter(r => state.selectedIds.has(r.id));
    const groups = new Map();
    for (const result of ranking.rank(selected, state.weights)) {
      if (!groups.has(result.route.beachId)) groups.set(result.route.beachId, []);
      groups.get(result.route.beachId).push(result);
    }
    $('comparison-results').innerHTML = groups.size ? [...groups].map(([id, results]) => `<section class="comparison-group"><h3 id="compare-${esc(id)}">${esc(allPlaces.get(id)?.name || id)} <span class="muted" style="font:10px var(--sans)">&middot; ${results.length} selected ${results.length === 1 ? 'route' : 'routes'}</span></h3><table class="comparison-table"><thead><tr><th>ROUTE</th><th>DISTANCE</th><th>MODEL TIME</th><th>SCENERY</th><th>DEMAND</th><th>YOUR SCORE</th></tr></thead><tbody>${results.map(result => `<tr><td><span class="route-swatch" style="--route-color:${routeColor(result.route.id)}"></span> ${esc(result.route.name)}<br><button class="text-button" data-fit="${esc(result.route.id)}">Trace route</button></td><td>${round(result.route.distanceKm)} km</td><td>&asymp; ${time(result.route.durationHours)}</td><td>${rating(result.route.scenery)}</td><td>${rating(result.route.difficulty)}</td><td>${result.status === 'complete' ? `<span class="score">${Math.round(result.score)}</span><small> / 100</small><details><summary>Why this score?</summary><ul>${result.contributions.map(c => `<li>${esc(c.label)}: ${c.points.toFixed(1)} points</li>`).join('')}</ul></details>${results.length === 1 ? '<span class="score-note">Only one route selected; this is not a comparative winner.</span>' : ''}` : `<span class="score-note">${result.status === 'disabled' ? 'Ranking off: all weights are zero.' : `Incomplete: ${esc(result.missing.join(', '))}. Set those weights to 0 to rank available data.`}</span>`}</td></tr>`).join('')}</tbody></table></section>`).join('') : '<div class="empty-state"><strong>Bring a few routes together.</strong>Select route checkboxes in the right panel. Choose the same beach to compare ghat alternatives.</div>';
  }
  function render(state, action) {
    if (action?.type === 'reset') {
      syncFilterControls();
      $('weight-note').textContent = defaultWeightNote;
    }
    const { filtered: visibleRoutes, displayed: focusedRoutes, focusRoutes, mapRoutes } = routeView(atlas, search, state);
    const profile = state.focus?.type === 'ghats' && (state.focus.id !== 'bor' || state.borAlignment === 'old-highway') ? fieldGuide.ghats[state.focus.id]?.elevation : null;
    if (action?.type === 'hover') {
      getMap()?.update({ visibleRoutes: mapRoutes, selectedIds: state.selectedIds, hoveredId: state.hoveredId, focusRoutes, mapView: state.mapView, profile });
      return;
    }
    const active = document.activeElement;
    const restoreId = active?.dataset.select;
    const restoreEntity = active?.dataset.entity;
    const restoreAlignment = active?.dataset.borAlignment;
    if (!previousState || !['weight', 'weights'].includes(action?.type)) {
      renderCatalog(state, visibleRoutes);
      renderDetail(state);
      renderRoutes(state, visibleRoutes, focusedRoutes);
      getMap()?.update({ visibleRoutes: mapRoutes, selectedIds: state.selectedIds, hoveredId: state.hoveredId, focusRoutes, mapView: state.mapView, profile });
    }
    for (const c of criteria) {
      const input = document.querySelector(`[data-weight="${c.key}"]`);
      input.value = state.weights[c.key];
      input.parentElement.querySelector('output').textContent = state.weights[c.key];
    }
    renderComparison(state);
    for (const variant of atlas.borAlignments?.variants || []) {
      const button = document.querySelector(`[data-bor-alignment="${variant.id}"]`);
      if (!button) continue;
      const color = routeColor(variant.routeIds[0]);
      button.style.setProperty('--variant-color', color);
      button.querySelector('.route-swatch').style.setProperty('--route-color', color);
    }
    guideViews.sync();
    if (restoreId) document.querySelector(`[data-select="${CSS.escape(restoreId)}"]`)?.focus({ preventScroll: true });
    else if (restoreEntity) document.querySelector(`[data-entity="${CSS.escape(restoreEntity)}"]`)?.focus({ preventScroll: true });
    else if (restoreAlignment) document.querySelector(`[data-bor-alignment="${CSS.escape(restoreAlignment)}"]`)?.focus({ preventScroll: true });
    $('selected-only').disabled = state.selectedIds.size === 0;
    $('fit-selection').disabled = mapRoutes.length === 0 && state.selectedIds.size === 0 && !state.hoveredId;
    $('selected-only').setAttribute('aria-pressed', String(state.mapView === 'selected'));
    previousState = state;
    localizeDocument();
  }
  function selectEntity(kind, id, autoSelect = true) {
    const action = { type: 'focus', mode: kind, id };
    if (kind === 'beaches' && autoSelect) {
      action.selectedIds = shortestByGhat(routeView(atlas, search, { ...store.state, focus: { type: kind, id } }).focusRoutes).map(route => route.id);
    }
    store.dispatch(action);
    const routes = routeView(atlas, search, store.state).focusRoutes;
    if (routes.length) getMap()?.fitRoutes(routes);
    else getMap()?.focusPoint(allPlaces.get(id).coordinates);
    $('announcement').textContent = `${allPlaces.get(id)?.name || 'Overview'} selected${action.selectedIds ? `; ${action.selectedIds.length} shortest ghat routes selected` : ''}`;
  }
  function showAbout() { $('about-dialog').showModal(); }
  function download(name, content, type) {
    const link = document.createElement('a');
    const url = URL.createObjectURL(new Blob([content], { type }));
    link.href = url; link.download = name; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function renderAbout() {
    const candidates = coverage.candidates || [];
    const methods = Object.entries(atlas.methodology || {}).filter(([, value]) => typeof value === 'string');
    const demand = atlas.methodology?.scoring?.difficulty;
    if (demand) methods.push(['Bend-demand rubric', [demand.rubric, demand.description, demand.routeAggregation].filter(Boolean).join(' ')]);
    $('about-content').innerHTML = `<p>A desktop field atlas from Pune to Maharashtra and Goa. The basemap is online; all routes, profiles, search and scoring are bundled in this file. No account or API key is required.</p><h3>Origin &amp; estimates</h3><p>${esc(atlas.origin.name)} (${atlas.origin.coordinates.map(n => n.toFixed(5)).join(', ')}). Times are OSRM driving-model estimates, rounded for display. They exclude live traffic, rest stops, parking and current restrictions.</p><h3>Coverage register</h3><p>${esc(coverage.completeness || coverage.scope || '')}</p><ul>${candidates.map(item => `<li><strong>${esc(item.name)}</strong> &mdash; ${esc(item.status)}. ${esc(item.rationale)}</li>`).join('')}</ul><h3>Scoring method</h3><p>Adjust weights from 0 to 10. Only routes to the same fixed beach arrival point share a ranking. Benefits use the complete destination group's fixed min/max bounds; lower distance, time and demand and higher scenery are favorable. A constant metric contributes equally. Unknown active metrics make a score incomplete; set their weights to 0 to compare available criteria. All-zero weights turn ranking off. Scores are preferences, not safety guarantees.</p><p>${esc(typeof atlas.methodology?.scoring?.scenery === 'object' ? atlas.methodology.scoring.scenery.rubric : '')}</p><h3>Research methodology</h3>${methods.map(([key, value]) => `<p><strong>${esc(key)}:</strong> ${esc(value)}</p>`).join('')}<h3>Sources</h3><ul class="source-list">${sourceRows.map(source => `<li>${safeUrl(source.url) ? `<a href="${safeUrl(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.title || source.id)}</a>` : esc(source.title || source.id)}<small>${esc(source.retrievedAt || source.retrievedDate || atlas.researchDate)} &middot; ${esc(source.description || source.notes || '')}</small></li>`).join('')}</ul><div class="download-row"><button class="quiet-button" data-download="data">Download embedded data</button><button class="quiet-button" data-download="sources">Download source register</button></div><details><summary>Data license &amp; attribution</summary><pre style="white-space:pre-wrap;font:10px/1.7 var(--sans)">${esc(license)}</pre></details><details><summary>Library licenses</summary><pre style="white-space:pre-wrap;font:10px/1.7 var(--sans)">${esc(libraryNotices)}</pre></details>`;
  }
  $('ghat-count').textContent = atlas.ghats.length;
  $('beach-count').textContent = atlas.beaches.length;
  $('route-total').textContent = `${atlas.routes.length} RESEARCHED ROUTES · ${atlas.ghats.length} CROSSINGS`;
  $('snapshot-label').textContent = `Route snapshot · ${atlas.researchDate}`;
  $('weight-controls').innerHTML = criteria.map(c => `<label class="weight-row" style="display:block"><span class="weight-label">${c.label}<output>5</output></span><input type="range" min="0" max="10" value="5" data-weight="${c.key}" aria-label="${c.label} weight"></label>`).join('') + '<button class="text-button" id="available-weights">Use available criteria only</button>';
  renderAbout();
  const themeSection = document.createElement('section');
  const themeHeading = document.createElement('h3');
  themeHeading.textContent = 'Colour palette & sources';
  const themeDescription = document.createElement('p');
  themeDescription.textContent = 'Ocean palette: cobalt, sky blue and ice. Adapted colours; application contrast is checked separately.';
  const themeLinks = document.createElement('p');
  for (const [index, source] of paletteSources.entries()) {
    if (index) themeLinks.append(' · ');
    const link = document.createElement('a');
    link.href = source.url; link.textContent = source.title;
    link.dataset.originalSource = ''; link.lang = 'en';
    link.target = '_blank'; link.rel = 'noopener noreferrer';
    themeLinks.append(link);
  }
  themeSection.append(themeHeading, themeDescription, themeLinks);
  $('about-content').append(themeSection);
  const guideSection = document.createElement('section');
  const guideHeading = document.createElement('h3');
  guideHeading.textContent = 'Journey stages, terrain profiles & historical evidence';
  guideSection.append(guideHeading);
  for (const method of Object.values(fieldGuide.methodology)) {
    const paragraph = document.createElement('p');
    paragraph.textContent = method;
    guideSection.append(paragraph);
  }
  $('about-content').append(guideSection);
  const auditSection = document.createElement('section');
  const auditHeading = document.createElement('h3');
  auditHeading.textContent = 'Ghat measurement audit';
  const auditPolicy = document.createElement('p');
  auditPolicy.textContent = measurementAudit.boundaryPolicy;
  const terrainPolicy = document.createElement('p');
  terrainPolicy.textContent = measurementAudit.method;
  const auditDownload = document.createElement('button');
  auditDownload.className = 'quiet-button';
  auditDownload.dataset.download = 'measurements';
  auditDownload.textContent = 'Download all 19 measurement audits';
  auditSection.append(auditHeading, auditPolicy, terrainPolicy, auditDownload);
  $('about-content').append(auditSection);
  const originalSourcesNote = document.createElement('p');
  originalSourcesNote.className = 'field-method';
  originalSourcesNote.textContent = 'Source titles, bibliographic references and licences are retained in their original language. Route evidence downloads retain canonical data and identifiers.';
  $('about-content').prepend(originalSourcesNote);
  const mapLanguageNote = document.createElement('p');
  mapLanguageNote.className = 'field-method';
  mapLanguageNote.textContent = 'Map names use source-language names and curated local spellings. Unavailable Marathi or Hindi names use the English source name, including rivers and water bodies. Automatic phonetic spellings are not used. Original map attribution is retained.';
  $('about-content').prepend(mapLanguageNote);
  const maharashtraNote = document.createElement('p');
  maharashtraNote.className = 'field-method';
  maharashtraNote.textContent = 'Maharashtra samples cover zooms 5–16 across ten regional views. They do not certify every tile or name. Source-language spellings match feature identities. Unresolved native names stay in English. Goa routes are unchanged.';
  const nameDownload = document.createElement('button');
  nameDownload.className = 'quiet-button';
  nameDownload.dataset.download = 'map-names';
  nameDownload.textContent = 'Download Maharashtra map-name references';
  $('about-content').prepend(maharashtraNote, nameDownload);
  const credit = document.createElement('p');
  credit.id = 'creator-credit';
  credit.className = 'creator-credit';
  credit.append('Created by: ');
  const creator = document.createElement('span');
  creator.dataset.originalSource = '';
  creator.lang = 'en';
  creator.textContent = 'Pranav Peshwe';
  credit.append(creator);
  $('about-content').prepend(credit);
  document.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.borAlignment) store.dispatch({ type: 'bor-alignment', id: button.dataset.borAlignment });
    else if (button.dataset.entity) selectEntity(button.dataset.kind, button.dataset.entity);
    else if (button.dataset.mode) store.dispatch({ type: 'mode', mode: button.dataset.mode });
    else if (button.dataset.result) {
      const kind = button.dataset.kind, id = button.dataset.result;
      if (kind === 'ghats' || kind === 'beaches') selectEntity(kind, id);
      else if (kind === 'routes') {
        const route = atlas.routes.find(r => r.id === id);
        selectEntity('ghats', primaryGhat(route));
        if (borAlignmentId(route)) store.dispatch({ type: 'bor-alignment', id: borAlignmentId(route) });
        if (!store.state.selectedIds.has(id)) store.dispatch({ type: 'toggle-route', id });
        getMap()?.fitRoutes([route]);
      } else {
        const point = allPlaces.get(id);
        getMap()?.focusPoint(point.coordinates);
        $('announcement').textContent = `${point.name} located; matching routes shown in the route panel`;
      }
    } else if (button.dataset.fit) {
      const route = atlas.routes.find(r => r.id === button.dataset.fit);
      store.dispatch({ type: 'trace-route', id: route.id });
      getMap()?.fitRoutes([route]);
    } else if (button.dataset.reveal) {
      const route = atlas.routes.find(r => r.id === button.dataset.reveal);
      store.dispatch({ type: 'reset-filters' }); syncFilterControls();
      selectEntity('beaches', route.beachId, false);
    } else if ('reset' in button.dataset) { store.dispatch({ type: 'reset-filters' }); syncFilterControls(); }
    else if ('about' in button.dataset) showAbout();
    else if (button.dataset.download === 'data') download('konkan-atlas-data.json', JSON.stringify({ ...atlas, fieldGuide, measurementAudit, mapNameReference }, null, 2), 'application/json');
    else if (button.dataset.download === 'map-names') download('konkan-maharashtra-map-names.json', JSON.stringify(mapNameReference, null, 2), 'application/json');
    else if (button.dataset.download === 'measurements') download('konkan-ghat-measurement-audit.json', JSON.stringify(measurementAudit, null, 2), 'application/json');
    else if (button.dataset.download === 'sources') download('konkan-atlas-sources.json', JSON.stringify({ sources, coverage }, null, 2), 'application/json');
  });
  document.addEventListener('change', event => {
    if (event.target.dataset.select) store.dispatch({ type: 'toggle-route', id: event.target.dataset.select });
  });
  document.addEventListener('input', event => {
    if (event.target.dataset.weight) store.dispatch({ type: 'weight', key: event.target.dataset.weight, value: Number(event.target.value) });
  });
  $('search').addEventListener('input', event => store.dispatch({ type: 'query', value: event.target.value }));
  const filterIds = { 'max-distance': 'maxDistance', 'max-time': 'maxTime', difficulty: 'difficulty', scenery: 'scenery' };
  for (const [id, key] of Object.entries(filterIds)) $(id).addEventListener('input', event => {
    const value = event.target.value === '' ? null : Number(event.target.value);
    store.dispatch({ type: 'filters', value: { [key]: Number.isFinite(value) && value >= 0 ? value : null } });
  });
  function syncFilterControls() {
    $('search').value = store.state.query;
    for (const [id, key] of Object.entries(filterIds)) $(id).value = store.state.filters[key] ?? '';
  }
  $('reset-filters').onclick = () => { store.dispatch({ type: 'reset-filters' }); syncFilterControls(); };
  $('clear-focus').onclick = () => { store.dispatch({ type: 'focus', mode: store.state.mode, id: null }); getMap()?.overview(); };
  $('compare-button').onclick = () => store.dispatch({ type: 'comparison', open: !store.state.comparisonOpen });
  $('close-comparison').onclick = () => { store.dispatch({ type: 'comparison', open: false }); $('compare-button').focus(); };
  $('clear-selection').onclick = () => store.dispatch({ type: 'clear-selection' });
  $('selected-only').onclick = () => store.dispatch({ type: 'map-view', value: store.state.mapView === 'selected' ? 'network' : 'selected' });
  $('about-button').onclick = showAbout;
  $('close-about').onclick = () => $('about-dialog').close();
  $('available-weights').onclick = () => {
    const selected = atlas.routes.filter(route => store.state.selectedIds.has(route.id));
    const candidates = selected.length ? selected : atlas.routes;
    const weights = Object.fromEntries(criteria.map(c => [c.key, candidates.every(route => Number.isFinite(route[c.field])) ? 5 : 0]));
    store.dispatch({ type: 'weights', value: weights });
    $('weight-note').textContent = 'Only criteria known for every selected route are active. You can still change any weight.';
  };
  document.addEventListener('keydown', event => {
    if (event.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && !document.querySelector('dialog[open]')) { event.preventDefault(); $('search').focus(); }
    if (event.key === 'Escape' && !document.querySelector('dialog[open]') && store.state.comparisonOpen) store.dispatch({ type: 'comparison', open: false });
  });
  return { render, selectEntity };
}
