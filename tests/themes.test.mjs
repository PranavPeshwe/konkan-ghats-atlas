import test from 'node:test';
import assert from 'node:assert/strict';
import { themes, getTheme, mixColor, mapThemePaint } from '../src/themes.js';
import { createColorScheme } from '../src/colors.js';

function luminance(hex) {
  const values = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255)
    .map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
}
function contrast(a, b) {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + 0.05) / (values[1] + 0.05);
}
function beige(hex) {
  const [r, g, b] = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16));
  return r > 180 && r >= g && g - b > 8 && r - b > 12;
}

test('Ocean is the sole supported non-beige palette', () => {
  assert.deepEqual(themes.map(theme => theme.id), ['ocean']);
  assert.equal(getTheme(), themes[0]);
  for (const theme of themes) {
    for (const color of [theme.paper, theme.panel, theme.soft, theme.header, theme.detail, theme.land, theme.water]) {
      assert.equal(beige(color), false, `${theme.name}: beige surface ${color}`);
    }
    assert.equal(mapThemePaint(theme).water['fill-color'], theme.water);
  }
});
test('Ocean text, controls and route names retain readable contrast', () => {
  for (const theme of themes) {
    for (const background of [theme.paper, theme.panel, theme.soft, theme.header, theme.detail]) {
      assert.ok(contrast(theme.ink, background) >= 4.5, `${theme.name}: body text`);
      assert.ok(contrast(theme.muted, background) >= 4.5, `${theme.name}: secondary text`);
    }
    const neighbors = ['--neighbor-a', '--neighbor-b', '--neighbor-c'].map(key => theme.variables[key]);
    assert.equal(new Set(neighbors).size, 3, `${theme.name}: distinct neighboring surfaces`);
    for (const background of neighbors) {
      assert.equal(beige(background), false, `${theme.name}: no beige neighboring surface`);
      assert.ok(contrast(theme.ink, background) >= 4.5, `${theme.name}: neighboring control text`);
    }
    assert.ok(contrast(theme.variables['--on-solid'], theme.accent) >= 4.5, `${theme.name}: primary button`);
    assert.ok(contrast(theme.ink, theme.water) >= 4.5, `${theme.name}: water labels`);
    for (const color of theme.routePalette) {
      assert.ok(contrast(color, mixColor(color, theme.panel, 0.1)) >= 4.5,
        `${theme.name}: route ${color} on selected card (${contrast(color, mixColor(color, theme.panel, 0.1)).toFixed(2)})`);
    }
  }
});
test('Ocean route colours preserve identity and destination distinctness', () => {
  const atlas = {
    ghats: [{ id: 'a' }],
    beaches: Array.from({ length: 35 }, (_, index) => ({ id: `beach-${index}` })),
    routes: Array.from({ length: 35 }, (_, index) => ({ id: `a-beach-${index}`, beachId: `beach-${index}`, ghatIds: ['a'] }))
  };
  const scheme = createColorScheme(atlas);
  assert.equal(scheme.routeColor(atlas.routes[0]), scheme.routeColor(atlas.routes[0].id));
  assert.equal(new Set(atlas.routes.map(route => scheme.routeColor(route))).size, 35);
});
