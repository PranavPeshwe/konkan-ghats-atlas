import { chromium } from '@playwright/test';
import { createExpression } from '@maplibre/maplibre-gl-style-spec';
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const regions = [
  ['Pune / Mulshi', [73.48, 18.48]], ['Mumbai', [72.87, 19.055]],
  ['Ratnagiri', [73.31, 16.99]], ['Sindhudurg', [73.47, 16.06]],
  ['Nashik', [73.79, 20.0]], ['Chhatrapati Sambhajinagar', [75.34, 19.88]],
  ['Nagpur', [79.09, 21.15]], ['Amravati', [77.75, 20.93]],
  ['Solapur', [75.91, 17.66]], ['Nanded', [77.32, 19.14]]
];
const output = process.argv[2] || resolve('data', 'maharashtra-label-samples.json');
const browser = await chromium.launch({ channel: 'chrome' });
const snapshots = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  await page.goto(pathToFileURL(resolve('pune_to_konkan.html')).href);
  await page.locator('#welcome-start').click();
  await page.waitForFunction(() => window.__atlas?.map.raw?.loaded(), { timeout: 45000 });
  for (const [region, center] of regions) {
    for (let zoom = 5; zoom <= 16; zoom++) {
      await page.evaluate(({ center, zoom }) => window.__atlas.map.raw.jumpTo({ center, zoom }), { center, zoom });
      await page.waitForFunction(() => window.__atlas.map.raw.areTilesLoaded(), { timeout: 30000 });
      await page.waitForTimeout(120);
      const layers = await page.evaluate(() => {
        const map = window.__atlas.map.raw;
        return map.getStyle().layers.filter(layer => layer.type === 'symbol' && layer.source === 'basemap').map(layer => ({
          id: layer.id, sourceLayer: layer['source-layer'], expression: map.getLayoutProperty(layer.id, 'text-field'),
          features: map.queryRenderedFeatures({ layers: [layer.id] }).map(feature => ({
            id: feature.id, geometry: feature.geometry,
            properties: Object.fromEntries(Object.entries(feature.properties).filter(([key]) =>
              ['name', 'name:en', 'name_en', 'name:latin', 'name:mr', 'name:hi', 'name:nonlatin', 'name_int', 'class', 'rank'].includes(key)))
          }))
        }));
      });
      const features = layers.flatMap(layer => {
        const expression = createExpression(layer.expression, `layers.${layer.id}.layout.text-field`);
        if (expression.result !== 'success') throw new Error(`Invalid label expression: ${layer.id}`);
        return layer.features.map(feature => ({
          ...feature, sourceLayer: layer.sourceLayer,
          label: expression.value.evaluate({ zoom }, { id: feature.id, properties: feature.properties })
        }));
      });
      snapshots.push({ region, center, zoom, features });
    }
    console.log(`Captured ${region}, zoom 5–16.`);
  }
} finally { await browser.close(); }
const features = new Map(snapshots.flatMap(snapshot => snapshot.features).map(feature => [`${feature.sourceLayer}:${feature.id}`, feature]));
const result = {
  retrievedAt: new Date().toISOString(),
  scope: 'Representative viewports centred in Maharashtra at every supported integer zoom 5–16. Viewport edges may include other states. This is not an exhaustive audit of every Maharashtra map tile.',
  regions, zooms: Array.from({ length: 12 }, (_, index) => index + 5), snapshots
};
await writeFile(output, JSON.stringify(result) + '\n');
console.log(`Saved ${snapshots.length} views and ${features.size} distinct named features.`);
console.log(JSON.stringify([...features.values()].filter(feature => feature.sourceLayer !== 'place').slice(0, 8).map(feature => ({ id: feature.id, layer: feature.sourceLayer, name: feature.properties.name }))));
