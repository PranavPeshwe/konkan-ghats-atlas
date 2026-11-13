import { names } from './translations.js';
import { createNativeNameLookup, isNativeMapName } from './map-name-reference.js';

let nativeLookup = () => null;
export function setMapNameReference(records) {
  nativeLookup = createNativeNameLookup(records);
}

const localNames = [
  ...names,
  ['Pimpri-Chinchwad', 'पिंपरी-चिंचवड', 'पिंपरी-चिंचवड'],
  ['Paud', 'पौड', 'पौड'], ['Lavasa', 'लवासा', 'लवासा'], ['Dhayari', 'धायरी', 'धायरी'],
  ['Anandnagar', 'आनंदनगर', 'आनंदनगर'], ['Nive', 'निवे', 'निवे'],
  ['Pen', 'पेण', 'पेण'], ['Uran', 'उरण', 'उरण'], ['Roha', 'रोहा', 'रोहा'],
  ['Panvel', 'पनवेल', 'पनवेल'], ['Kolad', 'कोलाड', 'कोलाड'], ['Pali', 'पाली', 'पाली'],
  ['Nagothane', 'नागोठणे', 'नागोठणे'], ['Dapoli', 'दापोली', 'दापोली'],
  ['Khed', 'खेड', 'खेड'], ['Dabhol', 'दाभोळ', 'दाभोल'], ['Tala', 'तळा', 'तला'],
  ['Goregaon', 'गोरेगाव', 'गोरेगांव'], ['Mhasla', 'म्हसळा', 'म्हसला'],
  ['Indapur', 'इंदापूर', 'इंदापुर'], ['Velas', 'वेळास', 'वेलास'],
  ['Mutha', 'मुठा', 'मुठा'], ['Mula', 'मुळा', 'मुला'], ['Kundalika', 'कुंडलिका', 'कुंडलिका'],
  ['Vashishti', 'वाशिष्ठी', 'वाशिष्ठी'], ['Vashishthi', 'वाशिष्ठी', 'वाशिष्ठी'],
  ['Savitri', 'सावित्री', 'सावित्री'], ['Koyna', 'कोयना', 'कोयना'], ['Krishna', 'कृष्णा', 'कृष्णा'],
  ['Mandovi', 'मांडवी', 'मांडवी'], ['Zuari', 'झुआरी', 'जुआरी'], ['Mhadei', 'म्हादई', 'म्हादई'],
  ['Jagbudi', 'जगबुडी', 'जगबुडी'], ['Venna', 'वेण्णा', 'वेण्णा'], ['Solshi', 'सोळशी', 'सोलशी'],
  ['Valki', 'वाळकी', 'वालकी'], ['Valvanti', 'वाळवंटी', 'वालवंटी'],
  ['Pavana', 'पवना', 'पवना'], ['Pawna', 'पवना', 'पवना'],
  ['Varasgaon', 'वरसगाव', 'वरसगांव'], ['Khadakwasla', 'खडकवासला', 'खडकवासला'],
  ['Panshet', 'पानशेत', 'पानशेत'], ['Temghar', 'टेमघर', 'टेमघर'],
  ['Shivasagar', 'शिवसागर', 'शिवसागर'], ['Kanher', 'कण्हेर', 'कण्हेर'],
  ['Urmodi', 'उरमोडी', 'उरमोडी'], ['Supa', 'सुपा', 'सुपा'],
  ['Hidakallu', 'हिडकल', 'हिडकल'], ['Kasarsai', 'कासारसाई', 'कासारसाई'],
  ['Ponda', 'फोंडा', 'फोंडा'], ['Sankhali', 'साखळी', 'साखली'], ['Valpoi', 'वाळपई', 'वालपई'],
  ['Ramanagara', 'रामनगर', 'रामनगर'], ['Bicholim', 'डिचोली', 'डिचोली'],
  ['Chapora', 'शापोरा', 'चापोरा'], ['Terekhol', 'तेरेखोल', 'तेरेखोल'],
  ['Tiracol', 'तेरेखोल', 'तेरेखोल'], ['Vaitarna', 'वैतरणा', 'वैतरणा'],
  ['Ulhas', 'उल्हास', 'उल्हास'], ['Bhima', 'भीमा', 'भीमा'],
  ['Indrayani', 'इंद्रायणी', 'इंद्रायणी'], ['Gad', 'गड', 'गड'], ['Kaal', 'काळ', 'काल'],
  ['Kal', 'काळ', 'काल']
];
const terms = [
  ['Lake', 'तलाव', 'झील'], ['Reservoir', 'जलाशय', 'जलाशय'], ['River', 'नदी', 'नदी'],
  ['Creek', 'खाडी', 'खाड़ी'], ['Sea', 'समुद्र', 'सागर'], ['Dam', 'धरण', 'बाँध'],
  ['Bay', 'उपसागर', 'खाड़ी'], ['Pond', 'तळे', 'तालाब'], ['Ocean', 'महासागर', 'महासागर'],
  ['Project', 'प्रकल्प', 'परियोजना'], ['Nadi', 'नदी', 'नदी'], ['Nala', 'नाला', 'नाला'],
  ['Road', 'रस्ता', 'सड़क'], ['Ghat', 'घाट', 'घाट'], ['Beach', 'समुद्रकिनारा', 'समुद्रतट']
];
const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const replacements = [...localNames, ...terms].sort((a, b) => b[0].length - a[0].length)
  .map(row => ({ row, pattern: new RegExp(`(?<![A-Za-z])${escape(row[0])}(?![A-Za-z])`, 'gi') }));
function indicToDevanagari(text) {
  return [...text].map(character => {
    const point = character.codePointAt(0);
    for (const base of [0x0980, 0x0a00, 0x0a80, 0x0b00, 0x0b80, 0x0c00, 0x0c80, 0x0d00]) {
      if (point >= base && point <= base + 0x7f) return String.fromCodePoint(point - base + 0x0900);
    }
    return character;
  }).join('');
}

const romanLetters = {
  अ: 'a', आ: 'aa', इ: 'i', ई: 'ee', उ: 'u', ऊ: 'oo', ऋ: 'ri', ए: 'e', ऐ: 'ai', ओ: 'o', औ: 'au',
  क: 'k', ख: 'kh', ग: 'g', घ: 'gh', ङ: 'ng', च: 'ch', छ: 'chh', ज: 'j', झ: 'jh', ञ: 'ny',
  ट: 't', ठ: 'th', ड: 'd', ढ: 'dh', ण: 'n', त: 't', थ: 'th', द: 'd', ध: 'dh', न: 'n',
  प: 'p', फ: 'ph', ब: 'b', भ: 'bh', म: 'm', य: 'y', र: 'r', ल: 'l', व: 'v', श: 'sh', ष: 'sh', स: 's', ह: 'h', ळ: 'l', ऱ: 'r',
  'ा': 'aa', 'ि': 'i', 'ी': 'ee', 'ु': 'u', 'ू': 'oo', 'ृ': 'ri', 'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au',
  'ं': 'n', 'ँ': 'n', 'ः': 'h', '्': '', '़': ''
};
function romanize(text) {
  const characters = [...indicToDevanagari(text)];
  return characters.map((character, index) => {
    if (/[०-९]/.test(character)) return String(character.charCodeAt(0) - 0x0966);
    const value = romanLetters[character];
    if (value === undefined) return character;
    const next = characters[index + 1] || '';
    return value + (/[क-हळऱ]/.test(character) && !/[ािीुूृेैोौ्]/.test(next) ? 'a' : '');
  }).join('').replace(/(^|[\s(-])([a-z])/g, (_, boundary, letter) => boundary + letter.toUpperCase());
}

function knownNativeText(value, language) {
  const column = language === 'mr' ? 1 : 2;
  let text = String(value || '');
  text = text.replace(/\p{Script=Latin}[\p{M}]*/gu, letter => letter.normalize('NFKD').replace(/\p{M}/gu, ''))
    .replace(/[æœøłß]/gi, letter => ({ æ: 'ae', œ: 'oe', ø: 'o', ł: 'l', ß: 'ss' })[letter.toLowerCase()]);
  for (const { row, pattern } of replacements) text = text.replace(pattern, row[column]);
  return text;
}

export function localizeMapText(value, language) {
  if (language === 'en') return romanize(String(value || ''));
  return knownNativeText(value, language).replace(/\d/g, digit => '०१२३४५६७८९'[Number(digit)]);
}

export const nameKeys = ['name', 'name:en', 'name_en', 'name:latin', 'name_int', 'name:nonlatin'];
export const featureName = properties => nameKeys.map(key => properties[key]).find(value => typeof value === 'string' && value.length) || '';
export const nameExpression = ['case', ...nameKeys.flatMap(key =>
  [['!=', ['coalesce', ['get', key], ''], ''], ['to-string', ['get', key]]]), ''];

export function mapNameDetails(properties, language, feature) {
  const reference = nativeLookup(properties, language, feature);
  if (reference) return reference;
  const preferred = language === 'en'
    ? ['name:en', 'name_en', 'name:latin', 'name_int', 'name']
    : [`name:${language}`, `name_${language}`];
  const explicit = preferred.map(key => properties[key]).find(value =>
    typeof value === 'string' && value.trim() && (language === 'en' || isNativeMapName(value)));
  const fallback = ['name:en', 'name_en', 'name:latin', 'name_int', 'name', 'name:nonlatin']
    .map(key => properties[key]).find(value => typeof value === 'string' && value.trim()) || '';
  const value = explicit?.trim() || fallback.trim();
  if (language === 'en' && explicit && ![...explicit].some(character => /\p{L}/u.test(character) && !/\p{Script=Latin}/u.test(character))) {
    return { name: explicit.trim(), status: 'source' };
  }
  if (language !== 'en' && isNativeMapName(explicit)) return { name: explicit.normalize('NFC').trim(), status: 'source' };
  if (language !== 'en' && !isNativeMapName(knownNativeText(value, language))) {
    const english = nativeLookup(properties, 'en', feature);
    if (english) return { ...english, status: 'fallback' };
    const source = ['name:en', 'name_en', 'name:latin', 'name_int', 'name', 'name:nonlatin']
      .map(key => properties[key]).find(value => typeof value === 'string' && value.trim() &&
        ![...value].some(character => /\p{L}/u.test(character) && !/\p{Script=Latin}/u.test(character)));
    return { name: source?.trim() || fallback.trim(), status: fallback ? 'fallback' : 'unknown' };
  }
  const name = localizeMapText(value, language);
  if (!name) return { name: '', status: 'unknown' };
  const approximate = language === 'en'
    ? /\p{Script=Devanagari}|[\u0980-\u0dff]/u.test(value)
    : /\p{Script=Latin}/u.test(knownNativeText(value, language)) || /[\u0980-\u0dff]/u.test(value);
  return { name, status: approximate ? 'approximate' : 'editorial' };
}

export function mapName(properties, language, feature) {
  const result = mapNameDetails(properties, language, feature);
  return result.status === 'approximate' ? `≈ ${result.name}` : result.name;
}
