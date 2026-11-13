import test from 'node:test';
import assert from 'node:assert/strict';
import { translate, setLanguage, placeName, languages } from '../src/i18n.js';
import { messages, names } from '../src/translations.js';
import { contentMessages } from '../src/translations-content.js';
import { narrativeMessages } from '../src/translations-narratives.js';
import { createSearch } from '../src/search.js';

test('English is the default and every authored message has both requested translations', () => {
  assert.deepEqual(languages.map(language => language.id), ['en', 'mr', 'hi']);
  for (const [source, mr, hi] of [...messages, ...contentMessages, ...narrativeMessages, ...names]) {
    assert.ok(source && mr && hi, `Missing message translation: ${source}`);
    for (const value of [mr, hi]) {
      assert.deepEqual([...source.matchAll(/\{\d+\}/g)].map(match => match[0]).sort(), [...value.matchAll(/\{\d+\}/g)].map(match => match[0]).sort(), `Missing template parameter: ${source}`);
    }
  }
});

test('native place names, templated measurements, comparison labels and reversibility use the selected language', () => {
  try {
    for (const language of ['mr', 'hi']) {
      setLanguage(language);
      assert.match(translate('Tamhini Ghat'), /ताम्हिणी घाट/);
      assert.match(translate('Compare Alibag via Tamhini Ghat'), /अलिबाग/);
      assert.match(translate('10 nearest of 38 catalogued beaches'), /10|१०/);
      assert.doesNotMatch(translate('Historical engineering ghat section: 13.0 km'), /Historical|section|km/);
      assert.doesNotMatch(translate('Scenery: 3 / 5 · Bend demand (curves only): 2 / 5'), /Scenery|Bend|curves/);
      assert.doesNotMatch(translate('Alibag via Bor - Expressway without Missing Link'), /via|without|Expressway/);
      for (const source of ['↺ Reset all', 'Trace on map ↗', 'Bend-demand rubric:', 'snapshot:', 'Language', 'Map', 'Scenery weight']) {
        assert.doesNotMatch(translate(source), /[A-Za-z]/, `Untranslated decorated label: ${source}`);
      }
      assert.match(placeName('Kasara Ghat', language), /कसारा घाट/);
    }
    setLanguage('en');
    assert.equal(translate('Tamhini Ghat'), 'Tamhini Ghat');
  } finally { setLanguage('en'); }
});

test('both scripts can search the same canonical IDs without changing the route data', () => {
  const atlas = {
    ghats: [{ id: 'tamhini', name: 'Tamhini Ghat' }],
    beaches: [{ id: 'alibag', name: 'Alibag' }], places: [],
    routes: [{ id: 'tamhini-alibag', name: 'Alibag via Tamhini Ghat', beachId: 'alibag', ghatIds: ['tamhini'], waypointIds: [] }]
  };
  const search = createSearch(atlas);
  for (const query of ['Tamhini', 'ताम्हिणी', 'ताम्हिणी घाट']) assert.ok(search.search(query).some(result => result.entity.id === 'tamhini'));
  assert.ok(search.search('अलिबाग').some(result => result.entity.id === 'alibag'));
});

test('all sourced narratives resolve to native-script text in each language', () => {
  try {
    for (const language of ['mr', 'hi']) {
      setLanguage(language);
      for (const [source] of narrativeMessages) {
        assert.match(translate(source), /\p{Script=Devanagari}/u, `Missing ${language} narrative: ${source}`);
        assert.notEqual(translate(source), source);
      }
    }
  } finally { setLanguage('en'); }
});
