import { messages, names } from './translations.js';
import { contentMessages } from './translations-content.js';
import { narrativeMessages } from './translations-narratives.js';

export const languages = [
  { id: 'en', name: 'English' }, { id: 'mr', name: 'मराठी' }, { id: 'hi', name: 'हिन्दी' }
];
let language = 'en';
const rows = [...messages, ...contentMessages, ...narrativeMessages];
const exact = new Map(rows.map(row => [row[0].replace(/\s+/g, ' ').trim(), row]));
const named = [...names].sort((a, b) => b[0].length - a[0].length);
const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const templates = rows.filter(row => /\{\d+\}/.test(row[0])).map(row => ({
  row, regex: new RegExp('^' + row[0].split(/(\{\d+\})/).map(piece => /^\{\d+\}$/.test(piece) ? '(.+?)' : escapeRegex(piece)).join('') + '$')
})).sort((a, b) => b.row[0].replace(/\{\d+\}/g, '').length - a.row[0].replace(/\{\d+\}/g, '').length);
const sourceText = new WeakMap(), sourceAttributes = new WeakMap();
const skip = 'script,style,pre,noscript,[data-original-source],.source-list,.maplibregl-ctrl-attrib-inner,#language-select option';
const attributes = ['aria-label', 'aria-valuetext', 'title', 'placeholder'];
const listeners = new Set();
export const getLanguage = () => language;
const index = () => language === 'mr' ? 1 : 2;

export function placeName(value, lang = language) {
  if (lang === 'en') return value;
  const column = lang === 'mr' ? 1 : 2;
  let text = value;
  for (const row of named) text = text.replace(new RegExp(`(?<![A-Za-z])${escapeRegex(row[0])}(?![A-Za-z])`, 'g'), row[column]);
  text = text.replace(/\bGhat\b/g, 'घाट');
  return text;
}

export function translate(value, depth = 0) {
  if (language === 'en' || typeof value !== 'string' || depth > 5) return value;
  const text = value.replace(/\s+/g, ' ').trim();
  if (!text || !/[A-Za-z]/.test(text)) return value;
  const entry = exact.get(text);
  if (entry && !/\{\d+\}/.test(entry[0])) return entry[index()];
  const decorated = text.match(/^([↺↻]\s*)(.+)$|^(.+?)(\s*[:↗])$/);
  if (decorated) return decorated[1] ? decorated[1] + translate(decorated[2], depth + 1) : translate(decorated[3], depth + 1) + decorated[4];
  for (const { row, regex } of templates) {
    const match = text.match(regex);
    if (!match) continue;
    return row[index()].replace(/\{(\d+)\}/g, (_, number) => translate(match[Number(number) + 1], depth + 1));
  }
  if (text.includes(' → ')) return text.split(' → ').map(part => translate(part, depth + 1)).join(' → ');
  if (text.includes(' · ')) return text.split(' · ').map(part => translate(part, depth + 1)).join(' · ');
  if (text.includes(' / ') && !/^\d/.test(text)) return text.split(' / ').map(part => translate(part, depth + 1)).join(' / ');
  if (text.includes(' - ')) return text.split(' - ').map(part => translate(part, depth + 1)).join(' — ');
  if (text.includes(' via ')) {
    const [destination, ...via] = text.split(' via ');
    return language === 'mr' ? `${translate(destination, depth + 1)} — ${translate(via.join(' via '), depth + 1)} मार्गे` : `${translate(destination, depth + 1)} — ${translate(via.join(' via '), depth + 1)} होकर`;
  }
  const translatedName = placeName(text);
  const suffixes = [
    [' Ghat', ' घाट', ' घाट'], [' corridor', ' मार्ग', ' गलियारा'],
    [' approach', 'कडचा मार्ग', ' की ओर का मार्ग'], [' bridge corridor', ' पूलमार्ग', ' पुल मार्ग'],
    [' mainland bridge corridor', ' मुख्य भूभागावरील पूलमार्ग', ' मुख्य भूभाग का पुल मार्ग'],
    [' · chosen road marker A', ' · निवडलेला रस्ताबिंदू A', ' · चुना सड़क बिंदु A'],
    [' · chosen road marker B', ' · निवडलेला रस्ताबिंदू B', ' · चुना सड़क बिंदु B'],
    [' · chosen interior road marker', ' · निवडलेला मधला रस्ताबिंदू', ' · चुना मध्य सड़क बिंदु']
  ];
  let result = translatedName;
  for (const row of suffixes.toReversed()) result = result.replaceAll(row[0], row[index()]);
  if (result !== text) return result;
  return value;
}

function localizeNode(node) {
  if (node.parentElement?.closest(skip)) return;
  const current = node.textContent;
  let saved = sourceText.get(node);
  if (!saved || current !== saved.rendered) saved = { source: current, rendered: current };
  let translated = translate(saved.source);
  if (language !== 'en') translated = translated.replace(/([A-Za-z]+\d[\w.-]*)|(\d)/g, (match, code, digit) => code || '०१२३४५६७८९'[Number(digit)]);
  const leading = saved.source.match(/^\s*/)[0], trailing = saved.source.match(/\s*$/)[0];
  const next = translated === saved.source ? saved.source : leading + translated + trailing;
  if (current !== next) node.textContent = next;
  saved.rendered = next;
  sourceText.set(node, saved);
}

export function localizeDocument(root = document.body) {
  if (!root) return;
  if (root.nodeType === Node.TEXT_NODE) { localizeNode(root); return; }
  if (root.closest?.(skip)) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) localizeNode(walker.currentNode);
  const elements = [...(root.matches?.('[aria-label],[aria-valuetext],[title],[placeholder]') ? [root] : []),
    ...root.querySelectorAll('[aria-label],[aria-valuetext],[title],[placeholder]')];
  for (const element of elements) {
    if (element.closest(skip)) continue;
    const saved = sourceAttributes.get(element) || {};
    for (const key of attributes) {
      const current = element.getAttribute(key);
      if (current === null) continue;
      if (!saved[key] || current !== saved[key].rendered) saved[key] = { source: current, rendered: current };
      const next = translate(saved[key].source);
      if (current !== next) element.setAttribute(key, next);
      saved[key].rendered = next;
    }
    sourceAttributes.set(element, saved);
  }
  const links = [...(root.matches?.('a[data-google-route]') ? [root] : []), ...root.querySelectorAll('a[data-google-route]')];
  for (const link of links) {
    const url = new URL(link.href);
    if (language === 'en') url.searchParams.delete('hl');
    else url.searchParams.set('hl', language);
    if (link.href !== url.href) link.href = url.href;
  }
}

export function setLanguage(id) {
  language = languages.some(item => item.id === id) ? id : 'en';
  if (typeof document !== 'undefined') {
    document.documentElement.lang = language;
    document.documentElement.dataset.language = language;
    document.title = translate('Konkan ghats atlas') + ' | ' + translate('PUNE TO THE COAST');
    document.getElementById('language-select').value = language;
    localizeDocument();
    document.dispatchEvent(new CustomEvent('atlas-language', { detail: language }));
  }
  for (const listener of listeners) listener(language);
}

export function installLanguages() {
  const selector = document.getElementById('language-select');
  selector.addEventListener('change', () => setLanguage(selector.value));
  const observer = new MutationObserver(records => {
    const roots = new Set();
    for (const record of records) {
      if (record.type === 'childList') for (const node of record.addedNodes) {
        if (node.nodeType === Node.TEXT_NODE || node.nodeType === Node.ELEMENT_NODE) roots.add(node);
      }
      else roots.add(record.target);
    }
    for (const root of roots) if (root.isConnected) localizeDocument(root);
  });
  observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: attributes });
  setLanguage('en');
}

export function onLanguageChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function searchNames(value) {
  return [value, placeName(value, 'mr'), placeName(value, 'hi')].join(' ');
}
