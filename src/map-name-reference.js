const normalize = value => String(value || '').normalize('NFKC').toLowerCase().replace(/[\s_-]+/g, ' ').trim();
const aliases = names => Object.values(names).flatMap(value => String(value).split(';')).map(normalize).filter(Boolean);

export function isNativeMapName(value) {
  return typeof value === 'string' && /\p{Script=Devanagari}/u.test(value) &&
    ![...value].some(character => /\p{L}/u.test(character) && !/\p{Script=Devanagari}/u.test(character));
}

export function createNativeNameLookup(records) {
  const index = new Map(records.map(record => [String(record.tileId), { ...record, aliases: new Set(aliases(record.names)) }]));
  return (properties, language, feature) => {
    if (feature?.id === undefined) return null;
    const record = index.get(String(feature.id));
    if (!record) return null;
    const sourceNames = ['name', 'name:en', 'name_en', 'name:latin', 'name:mr', 'name:hi', 'name_int']
      .map(key => normalize(properties[key])).filter(Boolean);
    if (!sourceNames.some(name => record.aliases.has(name))) return null;
    const name = record.names[`name:${language}`];
    if (!name || (language !== 'en' && !isNativeMapName(name))) return null;
    if (language === 'en' && /\p{Script=Devanagari}/u.test(name)) return null;
    return { name: name.normalize('NFC').trim(), status: 'source', osmType: record.osmType, osmId: record.osmId };
  };
}
