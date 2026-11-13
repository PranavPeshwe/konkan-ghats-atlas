import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { loadRouteRecord } from './prepare-routes.mjs';

const load = async file => JSON.parse(await readFile(resolve(file), 'utf8'));
const save = (file, value) => writeFile(resolve(file), JSON.stringify(value, null, 2) + '\n');
const atlas = await load('data/atlas.json');
const guide = await load('data/field-guide.json');
const lengthSources = await load('data/ghat-length-sources.json');
const inheritedSources = [...await load('data/sources.json'), ...guide.sources];
const referencedSourceIds = new Set(Object.values(lengthSources.ghats).flatMap(ghat => [...ghat.reviewedSourceIds, ...ghat.references.flatMap(reference => reference.sourceIds)]));
const fetchMissing = process.argv.includes('--fetch');
await mkdir(resolve('data/measurement-audit-cache'), { recursive: true });
let lastRequest = 0;
let lastCopernicusRequest = 0;
async function cached(url, id) {
  const hash = createHash('sha256').update(url).digest('hex').slice(0, 20);
  const cacheFile = `data/measurement-audit-cache/${id}-${hash}.json`;
  try { return { ...await load(cacheFile), cacheFile }; }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (!fetchMissing) throw new Error(`Missing ${cacheFile}; --fetch permits this finite audit only.`);
  await new Promise(resolve => setTimeout(resolve, Math.max(0, 1250 - (Date.now() - lastRequest))));
  if (url.startsWith('https://api.open-meteo.com/')) {
    await new Promise(resolve => setTimeout(resolve, Math.max(0, 10000 - (Date.now() - lastCopernicusRequest))));
    lastCopernicusRequest = Date.now();
  }
  lastRequest = Date.now();
  const response = await fetch(url, { signal: AbortSignal.timeout(90000), headers: { 'User-Agent': 'KonkanGhatsAtlas/1.0 (finite cached 19-profile terrain cross-check)' } });
  const body = await response.json();
  if (!response.ok || body.error || (body.status && body.status !== 'OK')) throw new Error(`Audit provider ${response.status}: ${body.reason || body.error || body.status}; stopped, no retries.`);
  const record = { requestUrl: url, retrievedAt: new Date().toISOString(), response: body };
  await save(cacheFile, record);
  return { ...record, cacheFile };
}
const report = {
  date: '2026-11-11',
  method: 'Three separate terrain products at identical coordinates: existing SRTM30m, ASTER GDEM v3 30m via Open Topo Data, and Copernicus DEM GLO-90 via Open-Meteo. Agreement is not road-deck surveying or validation of ghat boundaries. Source resolutions and vertical references differ. No average is substituted for measured source values.',
  boundaryPolicy: lengthSources.policy,
  legacyLengthField: 'atlas.ghats[].lengthKm denotes a chosen-anchor routing interval only, not the actual whole-ghat length.',
  sources: [...lengthSources.sources.map(source => ({
    ...source, reviewedAt: lengthSources.date,
    license: source.id === 'audit-aster' ? 'NASA/METI ASTER GDEM v3, supplied through Open Topo Data.'
      : source.id === 'audit-copernicus' ? 'Copernicus DEM GLO-90, Copernicus programme / ESA, supplied through Open-Meteo; DOI 10.5270/ESA-c5d3d65.'
        : 'Reference publication retains its copyright; links and short original factual paraphrases only.'
  })), ...inheritedSources.filter(source => referencedSourceIds.has(source.id))],
  ghats: {}
};
for (const ghat of atlas.ghats) {
  const profile = guide.ghats[ghat.id].elevation;
  const points = profile.samples.map(sample => sample.coordinates);
  const asterUrl = `https://api.opentopodata.org/v1/aster30m?${new URLSearchParams({ locations: points.map(point => `${point[1]},${point[0]}`).join('|'), interpolation: 'bilinear' })}`;
  const copernicusUrl = `https://api.open-meteo.com/v1/elevation?${new URLSearchParams({ latitude: points.map(point => point[1]).join(','), longitude: points.map(point => point[0]).join(',') })}`;
  const aster = await cached(asterUrl, `aster-${ghat.id}`);
  const copernicus = await cached(copernicusUrl, `copernicus-${ghat.id}`);
  if (aster.response.results?.length !== points.length || copernicus.response.elevation?.length !== points.length) throw new Error(`Incomplete independent samples ${ghat.id}`);
  const comparisons = profile.samples.map((sample, index) => {
    const result = aster.response.results[index];
    if (Math.abs(result.location.lat - sample.coordinates[1]) > 1e-7 || Math.abs(result.location.lng - sample.coordinates[0]) > 1e-7) throw new Error(`Comparison coordinate drift ${ghat.id}/${index}`);
    const srtmM = sample.elevationM, asterM = result.elevation, copernicusM = copernicus.response.elevation[index];
    const values = [srtmM, asterM, copernicusM].filter(Number.isFinite);
    if (values.length !== 3 || result.dataset !== 'aster30m') throw new Error(`Missing terrain source value ${ghat.id}/${index}`);
    return { coordinates: sample.coordinates, distanceM: sample.distanceM, srtmM, asterM, copernicusM, spreadM: Math.max(...values) - Math.min(...values) };
  });
  const route = atlas.routes.find(route => route.id === profile.routeId);
  const record = await loadRouteRecord(route.provenance.cacheFile);
  const section = route.provenance.ghatSections.find(section => section.ghatId === ghat.id);
  const a = route.waypointIds.indexOf(section.entryPlaceId), z = route.waypointIds.indexOf(section.exitPlaceId);
  const variants = atlas.routes.filter(route => route.ghatIds.includes(ghat.id));
  const spreads = comparisons.map(sample => sample.spreadM).filter(Number.isFinite).sort((a, b) => a - b);
  report.ghats[ghat.id] = {
    routeId: route.id, modelSectionDistanceM: profile.sectionDistanceM,
    actualGhatLengthM: null, actualBoundaryStatus: 'not-independently-established',
    ...lengthSources.ghats[ghat.id],
    sectionLengthVariantsM: [...new Set(variants.map(route => route.provenance.ghatSections.find(section => section.ghatId === ghat.id).distanceM))],
    entry: comparisons[0], exit: comparisons.at(-1),
    sampleCount: comparisons.length, medianSpreadM: (spreads[Math.floor((spreads.length - 1) / 2)] + spreads[Math.floor(spreads.length / 2)]) / 2, maxSpreadM: spreads.at(-1),
    sourceRecords: {
      srtm: { cacheFile: profile.cacheFile, requestUrl: profile.requestUrl, retrievedAt: profile.retrievedAt, response: profile.evidence },
      aster: { cacheFile: aster.cacheFile, requestUrl: aster.requestUrl, retrievedAt: aster.retrievedAt, response: aster.response },
      copernicus: { cacheFile: copernicus.cacheFile, requestUrl: copernicus.requestUrl, retrievedAt: copernicus.retrievedAt, response: copernicus.response }
    },
    modelLegs: record.response.routes[0].legs.slice(a, z).map(leg => ({
      distanceM: leg.distance,
      roads: [...new Set(leg.steps.map(step => [step.name, step.ref].filter(Boolean).join(' / ')).filter(Boolean))]
    })),
    comparisons
  };
  console.log(`${ghat.name}: model ${(profile.sectionDistanceM / 1000).toFixed(1)} km, median three-product spread ${report.ghats[ghat.id].medianSpreadM} m, max ${report.ghats[ghat.id].maxSpreadM} m`);
}
await save('data/ghat-measurement-audit.json', report);
console.log(`Audited ${Object.values(report.ghats).reduce((sum, ghat) => sum + ghat.sampleCount, 0)} terrain samples across three products. Actual ghat boundaries are a separate source-review requirement.`);
