import { waterLabelPaint } from './water-labels.js';

// Hue families: Open Color. Surface/foreground roles follow Radix Colors guidance.
export const paletteSources = [
  { title: 'Open Color: UI colour palettes', url: 'https://yeun.github.io/open-color/' },
  { title: 'Radix Colors: composing a palette', url: 'https://www.radix-ui.com/colors/docs/palette-composition/composing-a-palette' },
  { title: 'Radix Colors: background, control and text roles', url: 'https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale' }
];

const lightRoutes = [
  '#c92a2a', '#087f5b', '#6741d9', '#2b8a3e', '#a61e4d', '#1864ab',
  '#862e9c', '#0b7285', '#364fc7', '#9c36b5', '#1971c2', '#099268',
  '#a51155', '#5f3dc4', '#075985', '#7b2387', '#1b7338', '#b0253c',
  '#086b83', '#5c37ae', '#25703a', '#9b245b', '#2454a0'
];
const definitions = [
  {
    id: 'ocean', name: 'Ocean', description: 'Cobalt, sky blue and ice', mode: 'light',
    ink: '#132d50', muted: '#354f70', accent: '#1864ab', secondary: '#6741d9',
    paper: '#f0f7ff', panel: '#ffffff', soft: '#e1efff', header: '#d0ebff', detail: '#edf5ff',
    land: '#edf2ff', water: '#74c0fc', wood: '#a8d8c0', grass: '#d3f0e2', park: '#84c8b1',
    road: '#ffffff', roadEdge: '#9ab7dc', boundary: '#6488b1', offset: 4
  }
];

export function mixColor(foreground, background, amount) {
  const channel = (hex, index) => parseInt(hex.slice(index, index + 2), 16);
  return '#' + [1, 3, 5].map(index => Math.round(
    channel(foreground, index) * amount + channel(background, index) * (1 - amount)
  ).toString(16).padStart(2, '0')).join('');
}

function luminance(hex) {
  const linear = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

function routeTone(color, theme) {
  let tone = mixColor(color, theme.accent, 0.96);
  for (let step = 0; step < 60; step++) {
    const values = [luminance(tone), luminance(mixColor(tone, theme.panel, 0.1))].sort((a, b) => b - a);
    if ((values[0] + 0.05) / (values[1] + 0.05) >= 4.65) return tone;
    tone = mixColor(tone, '#000000', 0.95);
  }
  return tone;
}

export const themes = definitions.map(definition => {
  const t = definition;
  const line = mixColor(t.accent, t.panel, 0.25);
  const routes = lightRoutes;
  const thirdAccent = '#087f5b';
  return {
    ...t,
    routePalette: Array.from({ length: routes.length * 3 }, (_, index) => {
      const base = routes[(index + t.offset) % routes.length];
      const blend = Math.floor(index / routes.length) * 0.22;
      return routeTone(blend ? mixColor(routes[(index + t.offset + 7) % routes.length], base, blend) : base, t);
    }),
    variables: {
      '--ink': t.ink, '--muted': t.muted, '--paper': t.paper, '--panel': t.panel,
      '--line': line, '--accent': t.accent, '--sand': t.soft, '--orange': t.secondary,
      '--sun': t.accent, '--sea': t.water, '--leaf': t.accent,
      '--header-bg': t.header, '--soft-bg': t.soft, '--detail-bg': t.detail,
      '--guide-bg': t.soft, '--guide-ink': t.ink, '--control-bg': t.panel,
      '--solid': t.accent, '--on-solid': '#ffffff',
      '--solid-hover': mixColor(t.accent, '#000000', 0.88),
      '--badge-bg': mixColor(t.accent, t.panel, 0.1),
      '--badge-ink': t.accent, '--badge-border': line,
      '--secondary-bg': mixColor(t.secondary, t.panel, 0.08),
      '--secondary-ink': t.secondary,
      '--neighbor-a': mixColor(t.accent, t.panel, 0.1),
      '--neighbor-b': mixColor(t.secondary, t.panel, 0.1),
      '--neighbor-c': mixColor(thirdAccent, t.panel, 0.1),
      '--map-bg': t.land, '--map-overlay': `${t.panel}ee`,
      '--shadow': '#102d3a18',
      '--scrim': '#10213b77',
      '--on-ink': '#ffffff'
    }
  };
});

export const getTheme = () => themes[0];
export function applyDocumentTheme() {
  const theme = getTheme();
  const root = document.documentElement;
  for (const [name, value] of Object.entries(theme.variables)) root.style.setProperty(name, value);
  root.dataset.theme = theme.id;
  root.dataset.colorMode = theme.mode;
  root.style.colorScheme = theme.mode;
  try { localStorage.removeItem('pune-konkan-theme'); } catch { /* Direct-file storage can be unavailable. */ }
  return theme;
}

export function mapThemePaint(theme) {
  return {
    land: { 'background-color': theme.land },
    woodland: { 'fill-color': theme.wood },
    grass: { 'fill-color': theme.grass },
    park: { 'fill-color': theme.park },
    water: { 'fill-color': theme.water },
    waterways: { 'line-color': mixColor(theme.water, theme.accent, 0.5) },
    ...waterLabelPaint(theme),
    'minor-road': { 'line-color': theme.road },
    'main-road-case': { 'line-color': theme.roadEdge },
    'main-road': { 'line-color': theme.road },
    boundaries: { 'line-color': theme.boundary },
    'settlement-labels': { 'text-color': theme.muted, 'text-halo-color': theme.land },
    'route-casing': { 'line-color': '#ffffff' },
    'ghat-section-halo': { 'line-color': theme.panel },
    'ghat-section-line': { 'line-color': theme.secondary },
    'elevation-cursor': { 'circle-color': theme.secondary, 'circle-stroke-color': theme.panel },
    'atlas-place-circles': { 'circle-stroke-color': theme.panel },
    'atlas-place-labels': { 'text-color': theme.ink, 'text-halo-color': theme.land },
    'waypoint-circles': { 'circle-color': theme.panel, 'circle-stroke-color': theme.accent },
    'waypoint-labels': { 'text-color': theme.ink, 'text-halo-color': theme.land }
  };
}
