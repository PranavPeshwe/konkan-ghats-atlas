import test from 'node:test';
import assert from 'node:assert/strict';
import { mapName, mapNameDetails, localizeMapText, featureName } from '../src/map-names.js';
import { installMapLabels } from '../src/map-labels.js';
import { setLanguage } from '../src/i18n.js';

test('rivers, lakes and reservoirs have complete Marathi and Hindi names, not English suffixes', () => {
  for (const [name, mr, hi] of [
    ['Mulshi Lake', 'मुळशी तलाव', 'मुलशी झील'],
    ['Pavana Lake', 'पवना तलाव', 'पवना झील'],
    ['Khadakwasla Reservoir', 'खडकवासला जलाशय', 'खडकवासला जलाशय'],
    ['Vashishti', 'वाशिष्ठी', 'वाशिष्ठी'],
    ['Koyna', 'कोयना', 'कोयना'],
    ['Kaal River', 'काळ नदी', 'काल नदी'],
    ['Mula', 'मुळा', 'मुला']
  ]) {
    const properties = Object.freeze({ name, 'name:latin': name });
    assert.equal(mapName(properties, 'mr'), mr);
    assert.equal(mapName(properties, 'hi'), hi);
    assert.equal(mapName(properties, 'en'), name);
  }
});

test('selected-language tags win, empty tags do not win, and another language is not substituted', () => {
  const properties = { name: 'Mulshi Lake', 'name:mr': 'मुळशी सरोवर', 'name:hi': 'मुलशी झील' };
  assert.equal(mapName(properties, 'mr'), 'मुळशी सरोवर');
  assert.equal(mapName(properties, 'hi'), 'मुलशी झील');
  assert.equal(mapName({ ...properties, 'name:mr': '' }, 'mr'), 'मुळशी तलाव');
  assert.equal(mapName({ ...properties, 'name:en': '', name_en: 'Mulshi Lake' }, 'en'), 'Mulshi Lake');
});

test('unresolved villages and water bodies retain their complete English source names without guessed spellings', () => {
  for (const name of ['Gorhe', 'Pole', 'Nila Nala', 'Baila Nadi', 'Dhamangaon Lake', 'Āndhale', 'Pune Heights']) {
    for (const language of ['mr', 'hi']) {
      assert.equal(mapName({ name }, language), name);
      assert.equal(mapNameDetails({ name }, language).status, 'fallback');
    }
  }
  for (const language of ['mr', 'hi']) {
    assert.equal(mapName({ name: 'ಕಮತಗ', 'name:en': 'Kamataga' }, language), 'Kamataga');
    assert.equal(mapName({ name: 'ಕಮತಗ' }, language), 'ಕಮತಗ');
    assert.equal(mapName({ name: 'Pole', 'name:mr': 'Pole', name_mr: 'पोळे' }, language), language === 'mr' ? 'पोळे' : 'Pole');
    assert.equal(mapName({ name: 'Pole', [`name:${language}`]: 'Wrong English Name' }, language), 'Pole');
    assert.equal(mapName({ name: '', 'name:en': '' }, language), '');
  }
  assert.match(mapName({ name: 'ಕಮತಗ' }, 'en'), /^≈ [A-Za-z]+$/);
  assert.equal(localizeMapText('चुना सड़क बिंदु A 12', 'hi'), 'चुना सड़क बिंदु A १२');
  assert.equal(localizeMapText('Pole', 'mr'), 'Pole');
  assert.equal(localizeMapText('ಕಮತಗ', 'hi'), 'ಕಮತಗ');
  assert.equal(featureName({ name: ' Mulshi Lake ' }), ' Mulshi Lake ');
});

test('every tile label layer refreshes on language and tile changes without changing source features', () => {
  const scheduled = new Map();
  let sequence = 0;
  const beforeRequest = globalThis.requestAnimationFrame, beforeCancel = globalThis.cancelAnimationFrame;
  globalThis.requestAnimationFrame = callback => { scheduled.set(++sequence, callback); return sequence; };
  globalThis.cancelAnimationFrame = id => scheduled.delete(id);
  const layers = [
    ['settlement-labels', 'place'], ['water-body-labels', 'water_name'],
    ['water-point-labels', 'water_name'], ['waterway-labels', 'waterway'], ['road-labels', 'transportation_name']
  ].map(([id, sourceLayer]) => ({ id, type: 'symbol', source: 'basemap', 'source-layer': sourceLayer }));
  const features = {
    place: [{ properties: Object.freeze({ name: 'Paud' }) }],
    water_name: [{ properties: Object.freeze({ name: 'Mulshi Lake' }) }],
    waterway: [{ properties: Object.freeze({ name: 'Vashishti' }) }, { properties: Object.freeze({ name: 'Nila Nala' }) }],
    transportation_name: [{ properties: Object.freeze({ name: 'Paud Road' }) }]
  };
  const events = new Map(), layouts = new Map();
  const map = {
    getStyle: () => ({ layers }), getLayer: id => layers.find(layer => layer.id === id),
    querySourceFeatures: (_, { sourceLayer }) => features[sourceLayer],
    setLayoutProperty: (id, _, value) => layouts.set(id, value),
    on: (event, handler) => events.set(event, handler), off: event => events.delete(event)
  };
  let remove;
  try {
    setLanguage('en');
    remove = installMapLabels(map);
    assert.ok(layouts.get('water-body-labels').includes('Mulshi Lake'));
    setLanguage('mr');
    assert.ok(layouts.get('water-body-labels').includes('मुळशी तलाव'));
    assert.ok(layouts.get('road-labels').includes('पौड रस्ता'));
    assert.ok(layouts.get('waterway-labels').includes('Nila Nala'));
    assert.ok(!JSON.stringify([...layouts.values()]).includes('≈'));
    setLanguage('hi');
    assert.ok(layouts.get('water-body-labels').includes('मुलशी झील'));
    assert.ok(layouts.get('waterway-labels').includes('Nila Nala'));
    features.waterway.push({ properties: Object.freeze({ name: 'Koyna' }) });
    events.get('sourcedata')({ sourceId: 'basemap' });
    for (const [id, callback] of scheduled) { scheduled.delete(id); callback(); }
    assert.ok(layouts.get('waterway-labels').includes('कोयना'));
    setLanguage('en');
    assert.ok(layouts.get('waterway-labels').includes('Koyna'));
    assert.equal(features.water_name[0].properties.name, 'Mulshi Lake');
  } finally {
    remove?.(); setLanguage('en');
    globalThis.requestAnimationFrame = beforeRequest;
    globalThis.cancelAnimationFrame = beforeCancel;
  }
  assert.equal(events.size, 0);
});
