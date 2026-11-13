import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const load = async file => JSON.parse(await readFile(resolve(file), 'utf8'));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function validateMeasurementAudit(report, atlas, guide, sources, curation) {
  const errors = [];
  const check = (condition, message) => { if (!condition) errors.push(message); };
  const sourceIds = new Set([...sources, ...guide.sources, ...report.sources].map(source => source.id));
  check(report.boundaryPolicy === curation.policy && report.method && report.legacyLengthField, 'Missing measurement-scope policy');
  const curatedSourceIds = new Set(curation.sources.map(source => source.id));
  check(same(report.sources.filter(source => curatedSourceIds.has(source.id)).map(({ reviewedAt, license, ...source }) => source), curation.sources), 'Unreproduced measurement sources');
  check(new Set(report.sources.map(source => source.id)).size === report.sources.length, 'Duplicate measurement source');
  for (const source of report.sources.filter(source => !curatedSourceIds.has(source.id))) {
    check([...sources, ...guide.sources].some(original => same(source, original)), `Changed inherited measurement source ${source.id}`);
  }
  check(Object.keys(report.ghats).length === atlas.ghats.length && atlas.ghats.every(ghat => report.ghats[ghat.id]), 'Incomplete measurement audit');
  for (const ghat of atlas.ghats) {
    const audit = report.ghats[ghat.id], profile = guide.ghats[ghat.id].elevation;
    if (!audit) continue;
    check(audit.actualGhatLengthM === null && audit.actualBoundaryStatus === 'not-independently-established', `Unverified whole-ghat length promoted as fact ${ghat.id}`);
    check(same({ notes: audit.notes, reviewedSourceIds: audit.reviewedSourceIds, references: audit.references }, curation.ghats[ghat.id]), `Unreproduced boundary review ${ghat.id}`);
    check(audit.reviewedSourceIds?.length > 0 && audit.reviewedSourceIds.every(id => sourceIds.has(id)), `Missing reviewed source ${ghat.id}`);
    for (const reference of audit.references || []) {
      check(reference.label && reference.context && reference.scope && reference.sourceIds?.length > 0 && reference.sourceIds.every(id => sourceIds.has(id)) &&
        (reference.distanceM === null || (Number.isFinite(reference.distanceM) && reference.distanceM > 0)), `Invalid length reference ${ghat.id}`);
    }
    check(audit.routeId === profile.routeId && audit.modelSectionDistanceM === profile.sectionDistanceM, `Changed model interval ${ghat.id}`);
    const variants = [...new Set(atlas.routes.filter(route => route.ghatIds.includes(ghat.id))
      .map(route => route.provenance.ghatSections.find(section => section.ghatId === ghat.id).distanceM))];
    check(same(audit.sectionLengthVariantsM, variants), `Hidden route-section variation ${ghat.id}`);
    check(Math.abs(audit.modelLegs.reduce((sum, leg) => sum + leg.distanceM, 0) - profile.sectionDistanceM) < 0.001, `Unreconciled model interval ${ghat.id}`);
    const aster = audit.sourceRecords.aster, copernicus = audit.sourceRecords.copernicus;
    check(same(audit.sourceRecords.srtm, { cacheFile: profile.cacheFile, requestUrl: profile.requestUrl, retrievedAt: profile.retrievedAt, response: profile.evidence }), `Changed SRTM provenance ${ghat.id}`);
    check(aster.requestUrl.startsWith('https://api.opentopodata.org/v1/aster30m?') &&
      copernicus.requestUrl.startsWith('https://api.open-meteo.com/v1/elevation?') &&
      aster.response.status === 'OK' && aster.response.results?.length === profile.samples.length &&
      copernicus.response.elevation?.length === profile.samples.length, `Missing independent provider evidence ${ghat.id}`);
    const request = new URL(copernicus.requestUrl);
    check(same(request.searchParams.get('latitude')?.split(',').map(Number), profile.samples.map(sample => sample.coordinates[1])) &&
      same(request.searchParams.get('longitude')?.split(',').map(Number), profile.samples.map(sample => sample.coordinates[0])), `Reordered Copernicus request ${ghat.id}`);
    const asterRequest = new URL(aster.requestUrl);
    check(asterRequest.searchParams.get('locations') === profile.samples.map(sample => `${sample.coordinates[1]},${sample.coordinates[0]}`).join('|') &&
      asterRequest.searchParams.get('interpolation') === 'bilinear', `Changed ASTER request ${ghat.id}`);
    check(audit.sampleCount === profile.samples.length && audit.comparisons.length === profile.samples.length, `Incomplete terrain comparison ${ghat.id}`);
    const spreads = [];
    for (const [index, sample] of profile.samples.entries()) {
      const actual = audit.comparisons[index], evidence = aster.response.results?.[index];
      if (!actual || !evidence) { errors.push(`Missing comparison ${ghat.id}/${index}`); continue; }
      const values = [sample.elevationM, evidence.elevation, copernicus.response.elevation?.[index]];
      const spread = Math.max(...values) - Math.min(...values);
      check(values.every(Number.isFinite) && evidence.dataset === 'aster30m' &&
        Math.abs(evidence.location.lat - sample.coordinates[1]) < 1e-7 &&
        Math.abs(evidence.location.lng - sample.coordinates[0]) < 1e-7 &&
        same(actual.coordinates, sample.coordinates) && actual.distanceM === sample.distanceM &&
        same([actual.srtmM, actual.asterM, actual.copernicusM], values) && actual.spreadM === spread,
      `Unbacked three-product comparison ${ghat.id}/${index}`);
      spreads.push(spread);
    }
    spreads.sort((a, b) => a - b);
    check(audit.medianSpreadM === (spreads[Math.floor((spreads.length - 1) / 2)] + spreads[Math.floor(spreads.length / 2)]) / 2 && audit.maxSpreadM === spreads.at(-1), `Misstated terrain disagreement ${ghat.id}`);
    check(same(audit.entry, audit.comparisons[0]) && same(audit.exit, audit.comparisons.at(-1)), `Changed marker comparison ${ghat.id}`);
  }
  return errors;
}

export async function validateMeasurementAuditFiles(atlas, guide, sources) {
  const [report, curation] = await Promise.all(['data/ghat-measurement-audit.json', 'data/ghat-length-sources.json'].map(load));
  const errors = validateMeasurementAudit(report, atlas, guide, sources, curation);
  for (const [id, audit] of Object.entries(report.ghats)) {
    for (const provider of ['srtm', 'aster', 'copernicus']) {
      const source = audit.sourceRecords[provider], cache = await load(source.cacheFile);
      if (source.requestUrl !== cache.requestUrl || source.retrievedAt !== cache.retrievedAt || !same(source.response, cache.response)) {
        errors.push(`Comparison differs from persistent cache ${id}/${provider}`);
      }
    }
  }
  return { report, errors };
}
