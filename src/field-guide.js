import { markerName } from './marker-names.js';

const km = metres => `${(metres / 1000).toFixed(1)} km`;
const minutes = seconds => {
  const value = Math.round(seconds / 60);
  return value >= 60 ? `${Math.floor(value / 60)}h ${String(value % 60).padStart(2, '0')}m` : `${value} min`;
};
const metres = value => `\u2248 ${Math.round(value)} m`;

function chartScale(profile, audit) {
  const values = audit.comparisons.flatMap(sample => [sample.srtmM, sample.asterM, sample.copernicusM]);
  const low = Math.floor(Math.min(...values) / 100) * 100;
  const high = Math.max(low + 100, Math.ceil(Math.max(...values) / 100) * 100);
  return {
    low, high,
    x: value => 36 + value / profile.sectionDistanceM * 266,
    y: value => 14 + (high - value) / (high - low) * 100
  };
}

export function createFieldGuideViews({ atlas, fieldGuide, measurementAudit, sources, esc, sourceLinks, getMap, download }) {
  const places = new Map([...atlas.places, ...atlas.beaches, ...atlas.ghats, atlas.origin].map(place => [place.id, place]));
  const expandedJourneys = new Set();
  const name = id => markerName(places.get(id)) || id;
  function journeyContent(routeId) {
    const journey = fieldGuide.routes[routeId];
    if (!journey) return '<p class="field-unknown">No evidenced stage breakdown is available.</p>';
    const total = journey.stages.reduce((sum, stage) => sum + stage.distanceM, 0);
    return `<div class="journey-strip" aria-hidden="true">${journey.stages.map(stage => `<span class="stage-${stage.id}" style="flex:${stage.distanceM / total}"></span>`).join('')}</div>
      <ol class="journey-stages">${journey.stages.map(stage => `<li class="stage-${stage.id}" data-stage="${stage.id}" data-metres="${stage.distanceM}" data-seconds="${stage.durationSeconds}">
        <strong>${esc(stage.label)}</strong><span>${esc(name(stage.startPlaceId))} &rarr; ${esc(name(stage.endPlaceId))}</span>
        <b>${km(stage.distanceM)} <span>&middot; &asymp; ${minutes(stage.durationSeconds)}</span></b>
      </li>`).join('')}</ol>
      <p class="field-method">A and B are chosen routing markers, not verified ghat entrances/exits. The middle interval may contain approach roads or omit part of the ghat; further descent may occur after B. Fixed beach road arrival, not a parking promise. Driving-model times round to minutes here (route cards: five minutes); traffic and stops excluded. ${sourceLinks(journey.sourceIds)}</p>
      <button class="text-button" data-journey-evidence="${esc(routeId)}">Download stage evidence</button>`;
  }
  function journeyPanel(routeId) {
    return `<details class="journey-breakdown" data-journey="${esc(routeId)}"${expandedJourneys.has(routeId) ? ' open' : ''}><summary>Journey breakdown &middot; chosen road markers</summary><div data-journey-content></div></details>`;
  }
  function storiesPanel(ghatId) {
    const stories = fieldGuide.ghats[ghatId]?.stories || {};
    const fields = [
      ['nameMeaning', 'Name meanings', 'No credible etymology for this ghat name was established in the reviewed sources.'],
      ['nameNotes', 'Names & older spellings', 'No additional sourced name history is established here.'],
      ['history', 'History', 'No adequately sourced road-history account is established here.'],
      ['forts', 'Forts & documented roles', 'No guard-fort association is established in the reviewed credible sources.'],
      ['legends', 'Legends & traditions', 'No adequately sourced legend is established here.'],
      ['significance', 'Why this ghat matters', 'No additional sourced context is available.']
    ];
    return `<details class="ghat-stories"><summary>Names, history, forts &amp; legends</summary><h3 id="stories-${esc(ghatId)}">Why this ghat matters</h3>
      <p class="field-method">${esc(fieldGuide.terminology.text)} ${sourceLinks(fieldGuide.terminology.sourceIds)}</p>
      <dl class="field-notes">${fields.map(([key, title, unknown]) => {
        const claim = stories[key];
        return `<div data-claim="${key}" data-evidence="${claim ? 'sourced' : 'unknown'}"><dt>${title}${claim?.kind === 'recorded-tradition' ? ' <span class="badge warm">Recorded tradition</span>' : ''}</dt><dd class="${claim ? '' : 'field-unknown'}">${esc(claim?.text || unknown)}${claim ? `<small>${sourceLinks(claim.sourceIds)}<br><span data-original-source lang="en">${esc(claim.locator)}</span></small>` : ''}</dd></div>`;
      }).join('')}</dl></details>`;
  }
  function auditPanel(ghatId) {
    const audit = measurementAudit.ghats[ghatId];
    const bor = ghatId === 'bor' && atlas.borAlignments;
    const notes = bor ? ['Old NH48 and the two expressway alignments are now separate road choices. The legacy 23.0 km highway-labelled detour is retired, not presented as an expressway length. Published project extents are not substituted for ghat-only lengths.'] : audit.notes;
    return `<section class="measurement-audit" data-measurement-audit="${esc(ghatId)}">
      <h3 id="measurements-${esc(ghatId)}">Ghat length &amp; boundary audit</h3>
      <p class="field-method"><strong>Current exact whole-ghat length: not independently established.</strong> Chosen road markers have not been matched to a credible complete-ghat boundary pair. Their separation is not used as the actual ghat length.</p>
      ${notes.map(note => `<p class="field-method">${esc(note)}</p>`).join('')}
      <details><summary>Published references &amp; scope checks</summary><h3 id="measurement-sources-${esc(ghatId)}">What the measurements refer to</h3>
        <p>${bor ? 'Legacy audit intervals (not the three current alignment lengths)' : 'Sampled interval'}: ${bor ? audit.sectionLengthVariantsM.map(km).join(' / ') : km(audit.modelSectionDistanceM)}. ${bor ? 'The 23.0 km detour is not an expressway measurement. Current expressway itineraries have separate complete-leg evidence.' : audit.sectionLengthVariantsM.length > 1 ? `Other route variants use different chosen-marker intervals: ${audit.sectionLengthVariantsM.map(km).join(' / ')}.` : 'One chosen-marker interval across the cached variants.'} Not a verified whole-ghat extent.</p>
        ${audit.references.length ? `<dl class="field-notes">${audit.references.map(reference => `<div data-measurement-scope="${esc(reference.scope)}"><dt>${esc(reference.label)}${reference.distanceM != null ? `: ${reference.scope === 'approximate-ghat-road' ? '&asymp; ' : ''}${km(reference.distanceM)}` : ''}</dt><dd>${reference.reportedValue ? `${esc(reference.reportedValue)}. ` : ''}${esc(reference.context)}<small>${sourceLinks(reference.sourceIds)}</small></dd></div>`).join('')}</dl>` : '<p>No credible ghat-only numeric length was established from the reviewed references. No town-to-town, railway or project-road number is substituted.</p>'}
        <p>Reviewed identity, history and scope references: ${sourceLinks(audit.reviewedSourceIds)}</p>
      </details></section>`;
  }
  function profilePanel(ghatId) {
    const profile = fieldGuide.ghats[ghatId]?.elevation;
    if (profile?.status !== 'available') return '<p class="field-unknown">Elevation profile unavailable: credible samples are missing. No heights have been invented.</p>';
    const audit = measurementAudit.ghats[ghatId];
    const scale = chartScale(profile, audit);
    const points = profile.samples.map(sample => `${scale.x(sample.distanceM).toFixed(2)},${scale.y(sample.elevationM).toFixed(2)}`);
    const first = profile.samples[0], last = profile.samples.at(-1), difference = first.elevationM - last.elevationM;
    const highest = Math.max(...profile.samples.map(sample => sample.elevationM));
    const route = atlas.routes.find(route => route.id === profile.routeId);
    return `<section class="ghat-profile" aria-labelledby="elevation-${esc(ghatId)}">
      <div class="field-section-line"><h3 id="elevation-${esc(ghatId)}">Sampled-road terrain</h3><button class="text-button" data-fit-profile="${esc(ghatId)}">Fit sampled road &#8599;</button></div>
      <p class="field-method"><strong>Not a verified whole-ghat profile.</strong> The highlighted road runs between chosen markers only. Terrain heights are not surveyed road-deck elevations or the pass altitude.</p>
      ${ghatId === 'bor' ? '<p class="field-method"><strong>Old NH48 only.</strong> This terrain chart is not transferred to either expressway or to the Missing Link tunnels.</p>' : ''}
      <div class="profile-stats"><span>Marker A (SRTM) <b>${metres(first.elevationM)}</b></span><span>Marker B (SRTM) <b>${metres(last.elevationM)}</b></span><span>Between-markers net ${difference >= 0 ? 'descent' : 'climb'} <b>${metres(Math.abs(difference))}</b></span></div>
      <svg class="elevation-chart" data-profile-chart="${esc(ghatId)}" viewBox="0 0 320 144" role="img" aria-labelledby="chart-title-${esc(ghatId)} chart-desc-${esc(ghatId)}">
        <title id="chart-title-${esc(ghatId)}">${esc(name(ghatId))}: sampled terrain along the mapped road</title>
        <desc id="chart-desc-${esc(ghatId)}">${km(profile.sectionDistanceM)} between chosen road markers, not verified full-ghat boundaries. SRTM, ASTER and Copernicus terrain products are compared separately. Use the slider below for keyboard exploration.</desc>
        ${[scale.low, (scale.low + scale.high) / 2, scale.high].map(value => `<line class="profile-grid" x1="36" x2="302" y1="${scale.y(value)}" y2="${scale.y(value)}"/><text class="profile-axis" x="30" y="${scale.y(value) + 3}" text-anchor="end">${value}</text>`).join('')}
        <path class="profile-area" d="M36,114 L${points.join(' L')} L302,114 Z"/>
        <path class="profile-line" d="M${points.join(' L')}"/>
        ${[['asterM', 'aster'], ['copernicusM', 'copernicus']].map(([key, css]) => `<path class="profile-comparison profile-${css}" d="M${audit.comparisons.map(sample => `${scale.x(sample.distanceM).toFixed(2)},${scale.y(sample[key]).toFixed(2)}`).join(' L')}"/>`).join('')}
        <line class="profile-crosshair" data-profile-crosshair x1="36" x2="36" y1="14" y2="114"/>
        <circle class="profile-cursor" data-profile-cursor cx="36" cy="${scale.y(first.elevationM)}" r="4"/>
        <text class="profile-axis" x="36" y="134">0 km</text><text class="profile-axis" x="302" y="134" text-anchor="end">${km(profile.sectionDistanceM)}</text>
      </svg>
      <label class="sr-only" for="profile-slider-${esc(ghatId)}">Explore ${esc(name(ghatId))} elevation</label>
      <input class="profile-slider" id="profile-slider-${esc(ghatId)}" data-profile-slider="${esc(ghatId)}" type="range" min="0" max="${profile.samples.length - 1}" step="1" value="0">
      <div class="profile-key"><span class="key-srtm">SRTM &middot; 30 m</span><span class="key-aster">ASTER &middot; 30 m</span><span class="key-copernicus">Copernicus &middot; 90 m</span></div>
      <output class="profile-readout" data-profile-readout></output>
      <p class="field-method">Hover or use the slider to locate a sample. ${km(profile.sectionDistanceM)} sampled interval; highest SRTM sample ${metres(highest)}, not a verified summit.</p>
      <p class="field-method">At matching coordinates, the three terrain products differ by a median ${Math.round(audit.medianSpreadM)} m and a maximum ${Math.round(audit.maxSpreadM)} m here. Different resolutions and vertical references: this spread is not an error bar, confidence interval or proof of true road height.</p>
      <details class="profile-evidence"><summary>Elevation sources &amp; limits</summary><h3 id="elevation-evidence-${esc(ghatId)}">Elevation evidence</h3>
        <p>${esc(fieldGuide.methodology.elevation)}</p><p>Profile alignment: ${esc(route.name)}. Chosen-marker interval only; neither the full ghat nor the complete beach trip.</p>
        <p>${esc(measurementAudit.method)}</p>
        <p>Dataset ${esc(profile.dataset)} &middot; retrieved ${esc(profile.retrievedAt.slice(0, 10))} &middot; ${profile.samples.length} individually evidenced samples.</p>
        <p>${sourceLinks([...profile.sourceIds, 'audit-aster', 'audit-copernicus'])}</p><button class="text-button" data-profile-evidence="${esc(ghatId)}">Download profile and three-product evidence</button>
      </details></section>`;
  }
  function setPoint(ghatId, index) {
    const profile = fieldGuide.ghats[ghatId]?.elevation;
    const svg = document.querySelector(`[data-profile-chart="${CSS.escape(ghatId)}"]`);
    if (!profile || !svg || !Number.isInteger(index) || !profile.samples[index]) return;
    const audit = measurementAudit.ghats[ghatId];
    const sample = profile.samples[index], comparison = audit.comparisons[index], scale = chartScale(profile, audit);
    for (const attribute of ['x1', 'x2']) svg.querySelector('[data-profile-crosshair]').setAttribute(attribute, scale.x(sample.distanceM));
    const circle = svg.querySelector('[data-profile-cursor]');
    circle.setAttribute('cx', scale.x(sample.distanceM)); circle.setAttribute('cy', scale.y(sample.elevationM));
    const panel = svg.closest('.ghat-profile');
    const slider = panel.querySelector('[data-profile-slider]');
    slider.value = index;
    const readout = `${km(sample.distanceM)} along sampled road \u00b7 SRTM ${metres(comparison.srtmM)} \u00b7 ASTER ${metres(comparison.asterM)} \u00b7 Copernicus ${metres(comparison.copernicusM)} terrain`;
    slider.setAttribute('aria-valuetext', readout);
    panel.querySelector('[data-profile-readout]').textContent = readout;
    getMap()?.showElevationPoint(ghatId, index);
  }
  function sync() {
    for (const details of document.querySelectorAll('[data-journey][open]')) {
      const content = details.querySelector('[data-journey-content]');
      if (!content.childElementCount) content.innerHTML = journeyContent(details.dataset.journey);
    }
    const slider = document.querySelector('[data-profile-slider]');
    if (slider) setPoint(slider.dataset.profileSlider, Number(slider.value));
  }
  document.addEventListener('toggle', event => {
    const details = event.target;
    if (!details.dataset?.journey || !details.isConnected) return;
    if (details.open) expandedJourneys.add(details.dataset.journey);
    else expandedJourneys.delete(details.dataset.journey);
    if (details.open) sync();
  }, true);
  document.addEventListener('input', event => {
    if (event.target.dataset.profileSlider) setPoint(event.target.dataset.profileSlider, Number(event.target.value));
  });
  document.addEventListener('pointermove', event => {
    const svg = event.target.closest?.('[data-profile-chart]');
    if (!svg) return;
    const profile = fieldGuide.ghats[svg.dataset.profileChart].elevation;
    const box = svg.getBoundingClientRect();
    const distance = Math.max(0, Math.min(1, ((event.clientX - box.left) / box.width * 320 - 36) / 266)) * profile.sectionDistanceM;
    let best = 0;
    for (let i = 1; i < profile.samples.length; i++) if (Math.abs(profile.samples[i].distanceM - distance) < Math.abs(profile.samples[best].distanceM - distance)) best = i;
    setPoint(profile.ghatId, best);
  });
  document.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (button?.dataset.fitProfile) {
      const profile = fieldGuide.ghats[button.dataset.fitProfile].elevation;
      getMap()?.fitRoutes([{ geometry: profile.geometry }]);
    } else if (button?.dataset.profileEvidence) {
      const id = button.dataset.profileEvidence;
      download(`${id}-elevation-evidence.json`, JSON.stringify({ profile: fieldGuide.ghats[id].elevation, audit: measurementAudit.ghats[id], methodology: fieldGuide.methodology.elevation, comparisonMethod: measurementAudit.method, boundaryPolicy: measurementAudit.boundaryPolicy, sources }, null, 2), 'application/json');
    } else if (button?.dataset.journeyEvidence) {
      const id = button.dataset.journeyEvidence;
      download(`${id}-journey-evidence.json`, JSON.stringify({ journey: fieldGuide.routes[id], methodology: fieldGuide.methodology.journey, sources: sources.filter(source => fieldGuide.routes[id].sourceIds.includes(source.id)) }, null, 2), 'application/json');
    }
  });
  return { journeyPanel, storiesPanel, auditPanel, profilePanel, sync };
}

