import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditResponse, haversine, drivingDemand, loadRouteRecord } from './prepare-routes.mjs';
import { nearestCandidates, routeDigest, primaryGhatId } from './expand-beach-routes.mjs';
import Ajv from 'ajv';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const load=async file=>JSON.parse(await readFile(resolve(root,file),'utf8'));
const coordinate=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&p[0]>=72&&p[0]<=76&&p[1]>=14&&p[1]<=21;
const rating=value=>value===null||(Number.isInteger(value)&&value>=1&&value<=5);
export function validateData(atlas,sources,coverage) {
  const errors=[];
  const check=(condition,message)=>{if(!condition)errors.push(message);};
  check(atlas?.version&&/^\d{4}-\d{2}-\d{2}$/.test(atlas.researchDate),'Snapshot version/date required');
  check(coordinate(atlas?.origin?.coordinates),'Valid common Pune origin required');
  const sourceIds=new Set(sources.map(s=>s.id));
  check(atlas.ghats.length===19,'Expected nineteen canonical ghats');
  check(atlas.beaches.length>=35,'Expected at least thirty-five distinct beaches');
  const beachNames=atlas.beaches.map(b=>b.name.toLowerCase().trim());
  check(new Set(beachNames).size===beachNames.length,'Duplicate actual beach name');
  check(sourceIds.size===sources.length,'Duplicate source ID');
  for(const s of sources)check(s.title&&/^https:\/\//.test(s.url)&&s.retrievedAt&&s.description&&s.license,`Incomplete source ${s.id}`);
  const maps={};
  for(const key of ['ghats','beaches','places','routes']) {
    check(Array.isArray(atlas[key])&&atlas[key].length>0,`Missing ${key}`);
    maps[key]=new Map(atlas[key].map(item=>[item.id,item]));
    check(maps[key].size===atlas[key].length,`Duplicate ${key} ID`);
    for(const item of atlas[key]) {
      check(item.id&&item.name,`Missing ${key} identity`);
      check(Array.isArray(item.sourceIds)&&item.sourceIds.length>0,`Missing ${item.id} sources`);
      for(const id of item.sourceIds??[])check(sourceIds.has(id),`Unknown source ${id} on ${item.id}`);
      if(key!=='routes')check(coordinate(item.coordinates),`Invalid coordinate ${item.id}`);
    }
    const comparisons=atlas.methodology.nearestBeaches?.candidateComparisons??[];
    check(comparisons.length===atlas.ghats.length&&comparisons.every(c=>maps.ghats.has(c.ghatId))&&
      new Set(comparisons.map(c=>c.ghatId)).size===comparisons.length,'Invalid supported-ghat comparison inventory');
    check(comparisons.every(c=>Number.isInteger(c.tableSourceIndex)&&c.tableSourceIndex>=0)&&
      new Set(comparisons.map(c=>c.tableSourceIndex)).size===comparisons.length,'Invalid cached comparison source indices');
  }
  for(const g of atlas.ghats) {
    check(rating(g.difficulty)&&rating(g.scenery),`Invalid ordinal ${g.id}`);
    check(g.elevationM===null||Number.isFinite(g.elevationM),`Invalid elevation ${g.id}`);
    check(g.lengthKm===null||(Number.isFinite(g.lengthKm)&&g.lengthKm>0),`Invalid section length ${g.id}`);
    check(g.accessNotes&&g.seasonalNotes&&g.claims,`Missing uncertainty/claims ${g.id}`);
    check(g.roadDemand?.rating===g.difficulty&&g.roadDemand?.sampleSpacingM===100&&Number.isFinite(g.roadDemand?.turnsPer10Km),`Missing reproducible road-demand evidence ${g.id}`);
    check(g.waypoints.length>=3&&g.waypoints.every(id=>maps.places.has(id)),`Missing ordered ghat anchors ${g.id}`);
    check(atlas.routes.some(r=>r.ghatIds.includes(g.id)),`Included ghat has no itinerary ${g.id}`);
    const nearest=g.nearestBeachIds,selected=g.closestBeachRoutes;
    check(Array.isArray(nearest)&&nearest.length===10&&new Set(nearest).size===10&&nearest.every(id=>maps.beaches.has(id)),`Missing ten unique nearest beaches ${g.id}`);
    check(Array.isArray(selected)&&selected.length===10,`Missing nearest route evidence ${g.id}`);
    if(Array.isArray(selected)) {
      for(const [i,s] of selected.entries()) {
        const r=maps.routes.get(s.routeId);
        check(r&&r.kind==='ghat'&&primaryGhatId(r,atlas.ghats)===g.id&&r.beachId===s.beachId&&nearest?.[i]===s.beachId&&s.distanceM===r.distanceM,`Invalid nearest route evidence ${g.id}/${i}`);
        check(i===0||s.distanceM>=selected[i-1].distanceM,`Unsorted nearest beaches ${g.id}`);
        if(i>0&&s.distanceM===selected[i-1].distanceM)check(s.beachId.localeCompare(selected[i-1].beachId)>0,`Unstable nearest tie ${g.id}`);
      }
      const comparison=atlas.methodology.nearestBeaches?.candidateComparisons?.find(c=>c.ghatId===g.id);
      check(comparison?.candidates?.length===atlas.beaches.length&&new Set(comparison?.candidates?.map(c=>c.beachId)).size===atlas.beaches.length,`Missing all-beach comparison ${g.id}`);
      for(const c of comparison?.candidates??[]) {
        const s=selected.find(s=>s.beachId===c.beachId);
        if(s)check(s.comparisonDistanceM===c.distanceM,`Nearest comparison mismatch ${g.id}/${c.beachId}`);
        else {
          const audited=atlas.routes.filter(r=>r.kind==='ghat'&&primaryGhatId(r,atlas.ghats)===g.id&&r.beachId===c.beachId).sort((a,b)=>a.distanceM-b.distanceM)[0];
          check((audited?.distanceM??c.distanceM)>=selected.at(-1)?.distanceM,`Unresolved nearest comparison boundary ${g.id}/${c.beachId}`);
        }
      }
      for(const r of atlas.routes.filter(r=>r.kind==='ghat'&&primaryGhatId(r,atlas.ghats)===g.id)) {
        const selectedSame=selected.find(s=>s.beachId===r.beachId);
        check(r.distanceM>=(selectedSame?.distanceM??selected.at(-1)?.distanceM),`Shorter audited destination omitted ${g.id}/${r.beachId}`);
      }
    }
  }
  for(const b of atlas.beaches) {
    const ids=b.shortestGhatIds,selected=b.closestGhatRoutes;
    check(Array.isArray(ids)&&ids.length===5&&new Set(ids).size===5&&ids.every(id=>maps.ghats.has(id)),`Missing five distinct primary ghats ${b.id}`);
    check(Array.isArray(selected)&&selected.length===5,`Missing five ghat-route evidence ${b.id}`);
    if(!Array.isArray(selected))continue;
    for(const [i,s] of selected.entries()) {
      const r=maps.routes.get(s.routeId);
      check(r&&r.kind==='ghat'&&primaryGhatId(r,atlas.ghats)===s.ghatId&&r.beachId===b.id&&ids?.[i]===s.ghatId&&s.distanceM===r.distanceM,`Invalid closest ghat evidence ${b.id}/${i}`);
      check(i===0||s.distanceM>selected[i-1].distanceM||(s.distanceM===selected[i-1].distanceM&&s.ghatId.localeCompare(selected[i-1].ghatId)>0),`Unsorted closest ghats ${b.id}`);
      const comparison=atlas.methodology.nearestBeaches?.candidateComparisons?.find(c=>c.ghatId===s.ghatId)?.candidates?.find(c=>c.beachId===b.id);
      check(s.comparisonDistanceM===comparison?.distanceM,`Closest ghat comparison mismatch ${b.id}/${s.ghatId}`);
    }
    for(const g of atlas.ghats) {
      const audited=atlas.routes.filter(r=>r.kind==='ghat'&&r.beachId===b.id&&primaryGhatId(r,atlas.ghats)===g.id).sort((a,b)=>a.distanceM-b.distanceM)[0];
      const picked=selected.find(s=>s.ghatId===g.id);
      const numeric=atlas.methodology.nearestBeaches?.candidateComparisons?.find(c=>c.ghatId===g.id)?.candidates?.find(c=>c.beachId===b.id)?.distanceM;
      check((audited?.distanceM??numeric)>=(picked?.distanceM??selected.at(-1)?.distanceM),`Unresolved closest ghat boundary ${b.id}/${g.id}`);
    }
  }
  const graph=atlas.adjacencyGraph;
  check(graph?.directed===true&&Array.isArray(graph?.routeEdges),'Missing primary-ghat adjacency graph');
  check(graph?.routeEdges?.length===atlas.routes.filter(r=>r.kind==='ghat').length&&new Set(graph?.routeEdges?.map(e=>e.routeId)).size===graph?.routeEdges?.length,'Incomplete or duplicated adjacency edges');
  for(const edge of graph?.routeEdges??[]) {
    const r=maps.routes.get(edge.routeId);
    check(r&&r.kind==='ghat'&&edge.ghatId===primaryGhatId(r,atlas.ghats)&&edge.beachId===r.beachId&&edge.distanceM===r.distanceM&&JSON.stringify(edge.traversedGhatIds)===JSON.stringify(r.ghatIds),`Invalid primary-ghat adjacency edge ${edge.routeId}`);
  }
  for(const r of atlas.routes) {
    const b=maps.beaches.get(r.beachId),p=r.provenance,points=r.geometry?.coordinates;
    check(b&&r.originId===atlas.origin.id,`Unknown endpoint ${r.id}`);
    check(['ghat','highway'].includes(r.kind),`Invalid route kind ${r.id}`);
    check(r.ghatIds.length>0&&r.ghatIds.every(id=>maps.ghats.has(id)),`Unknown ghat ${r.id}`);
    if(p?.coverageExpansion)check(r.primaryGhatId&&maps.ghats.has(r.primaryGhatId)&&r.ghatIds.includes(r.primaryGhatId),`Missing explicit primary ghat ${r.id}`);
    check(r.geometry?.type==='LineString'&&points?.length>20&&points.every(coordinate),`Invalid road geometry ${r.id}`);
    check(Number.isFinite(r.distanceKm)&&r.distanceKm>0&&Number.isFinite(r.durationHours)&&r.durationHours>0,`Invalid metrics ${r.id}`);
    check(Math.abs(r.distanceKm*1000-r.distanceM)<0.001&&Math.abs(r.durationHours*3600-r.durationSeconds)<0.001,`Metric unit mismatch ${r.id}`);
    check(rating(r.difficulty)&&rating(r.scenery)&&(r.tollCostInr===null||r.tollCostInr>=0),`Invalid ranking input ${r.id}`);
    check(p?.engine==='OSRM'&&p.profile&&p.cacheFile&&p.retrievedAt&&p.verifiedAt===null,`Incomplete routing provenance ${r.id}`);
    check(r.waypointIds.length===p?.waypointPositions?.length&&r.waypointIds.every(id=>maps.places.has(id)),`Missing route places ${r.id}`);
    if(points?.length&&b) {
      check(haversine(points[0],atlas.origin.coordinates)<3,`Inconsistent origin ${r.id}`);
      check(haversine(points.at(-1),b.coordinates)<3,`Inconsistent destination ${r.id}`);
      let previous=-1;
      for(const [i,w] of (p?.waypointPositions??[]).entries()) {
        check(w.placeId===r.waypointIds[i]&&w.geometryIndex>previous&&w.geometryIndex<points.length,`Unordered waypoint ${r.id}/${i}`);
        check(points[w.geometryIndex]&&haversine(points[w.geometryIndex],w.coordinates)<3,`Waypoint off line ${r.id}/${i}`);
        check(haversine(maps.places.get(w.placeId).coordinates,w.coordinates)<30,`Place coordinate drift ${r.id}/${i}`);
        check(w.onRoute===true&&w.distanceAlongM>=0&&w.distanceAlongM<=r.distanceM+1,`Bad along-route measure ${r.id}/${i}`);
        previous=w.geometryIndex;
      }
      let measured=0;
      for(let i=1;i<points.length;i++){const gap=haversine(points[i-1],points[i]);check(gap<=5000,`Exceptional geometry edge ${r.id}`);measured+=gap;}
      check(Math.abs(measured-r.distanceM)/r.distanceM<0.035,`Geometry/distance divergence ${r.id}`);
    }
    for(const id of r.ghatIds) {
      const section=p?.ghatSections?.find(s=>s.ghatId===id);
      check(section&&section.distanceM>0,`Missing measured ghat section ${r.id}/${id}`);
      if(section) {
        const a=r.waypointIds.indexOf(section.entryPlaceId),m=r.waypointIds.indexOf(section.interiorPlaceId),z=r.waypointIds.indexOf(section.exitPlaceId);
        check(a>=0&&a<m&&m<z,`Missing entry/interior/exit order ${r.id}`);
      }
    }
    check(r.difficulty===Math.max(...(p?.ghatSections??[]).map(s=>s.roadDemand?.rating??0)),`Unexplained route demand ${r.id}`);
    if(coverage.baseline?.accessLoopGhatIds?.some(id=>r.ghatIds.includes(id)))check(p.accessLoop&&r.ghatIds.length>1,`Undisclosed access-loop itinerary ${r.id}`);
  }
  check(coverage.researchDate===atlas.researchDate&&coverage.completeness&&coverage.networkAudit,'Missing coverage methodology');
  check(atlas.methodology.nearestBeaches?.count===10&&atlas.methodology.nearestBeaches?.ghatsPerBeach===5&&coverage.destinationCoverage?.beachesPerGhat===10&&coverage.destinationCoverage?.ghatsPerBeach===5&&coverage.destinationCoverage?.comparedBeachCount===atlas.beaches.length,'Missing ten/five coverage methodology');
  check(atlas.methodology.nearestBeaches?.geometryRequestsUsed<=150,'Finite geometry request budget exceeded');
  const retained=atlas.methodology.nearestBeaches?.retainedRoutes;
  check(Array.isArray(retained)&&retained.length>0&&new Set(retained.map(r=>r.routeId)).size===retained.length,'Missing retained-route integrity evidence');
  for(const entry of retained??[]) {
    const r=maps.routes.get(entry.routeId);
    check(r&&routeDigest(r)===entry.sha256,`Changed original route ${entry.routeId}`);
  }
  let latitude=Infinity;
  for(const c of coverage.candidates) {
    check(c.latitude<=latitude,'Coverage is not north-to-south');latitude=c.latitude;
    check(c.status&&c.rationale&&Array.isArray(c.sourceIds),`Incomplete coverage row ${c.id}`);
    for(const id of c.sourceIds)check(sourceIds.has(id),`Unknown coverage source ${id}`);
    if(c.status==='included')check(maps.ghats.has(c.id)&&c.routeIds.length>0&&c.routeIds.every(id=>maps.routes.has(id)),`Invalid included crossing ${c.id}`);
    else check(!maps.ghats.has(c.id),`Unresolved crossing presented as included ${c.id}`);
  }
  check(atlas.ghats.every(g=>coverage.candidates.some(c=>c.id===g.id&&c.status==='included')),'Included crossing missing from coverage');
  if(coverage.baseline) {
    const complete=coverage.baseline.expectedGhatIds.every(id=>maps.ghats.has(id)&&atlas.routes.some(r=>r.ghatIds.includes(id)));
    check(complete===coverage.baseline.confirmedRoadCoverageComplete,'False baseline completeness claim');
    check(coverage.specificBlockedClaims?.every(c=>coverage.candidates.some(row=>row.id===c.id&&row.status.startsWith('blocked-'))),'Unaccounted blocked-link claim');
  }
  for(const b of atlas.beaches) {
    const group=atlas.routes.filter(r=>r.beachId===b.id);
    for(const key of ['distanceKm','durationHours','difficulty','scenery',...(atlas.borAlignments?[]:['tollCostInr'])]) {
      const values=group.map(r=>r[key]).filter(Number.isFinite),bounds=atlas.methodology.normalizationBounds[b.id][key];
      check(values.length?bounds?.min===Math.min(...values)&&bounds?.max===Math.max(...values):bounds===null,`Unstable normalization bounds ${b.id}/${key}`);
    }
  }
  return errors;
}
export async function validateFiles() {
  const [atlas,sources,coverage]=await Promise.all(['data/atlas.json','data/sources.json','data/coverage-register.json'].map(load));
  const validateSchema=new Ajv({allErrors:true}).compile(await load('data/atlas.schema.json'));
  if(!validateSchema(atlas))return {atlas,sources,coverage,errors:validateSchema.errors.map(error=>`Schema ${error.instancePath}: ${error.message}`)};
  const errors=validateData(atlas,sources,coverage);
  try {
    const method=atlas.methodology.nearestBeaches,table=await load(method.tableCacheFile);
    if(table.response.code!=='Ok'||table.requestUrl!==method.tableRequestUrl||table.retrievedAt!==method.retrievedAt)errors.push('Invalid cached nearest-beach table provenance');
    if(table.response.distances.length<atlas.ghats.length||table.response.sources.length!==table.response.distances.length||table.response.distances.some(row=>row.length!==atlas.beaches.length))errors.push('Invalid cached nearest-beach table dimensions');
    for(const g of atlas.ghats) {
      const comparison=method.candidateComparisons.find(c=>c.ghatId===g.id);
      const sourceIndex=comparison.tableSourceIndex;
      if(!Number.isInteger(sourceIndex)||!table.response.distances[sourceIndex]){errors.push(`Invalid nearest-beach source row ${g.id}`);continue;}
      const template=atlas.routes.find(r=>r.id===comparison.templateRouteId);
      const exit=template.provenance.waypointPositions.find(w=>w.role==='ghat-exit');
      if(exit.distanceAlongM!==comparison.prefixDistanceM||haversine(exit.coordinates,table.response.sources[sourceIndex].location)>3)errors.push(`Unreproducible nearest-beach prefix ${g.id}`);
      const expected=nearestCandidates(table.response.distances[sourceIndex],atlas.beaches.map(b=>b.id),comparison.prefixDistanceM);
      if(JSON.stringify(expected)!==JSON.stringify(comparison.candidates))errors.push(`Unreproducible nearest-beach comparison ${g.id}`);
    }
    for(const [i,b] of atlas.beaches.entries())if(haversine(b.coordinates,table.response.destinations[i].location)>3)errors.push(`Nearest-beach table destination drift ${b.id}`);
  }catch(error){errors.push(`Nearest-beach table: ${error.message}`);}
  for(const route of atlas.routes) {
    try {
      const cached=await loadRouteRecord(route.provenance.cacheFile);
      const indices=auditResponse(cached);
      const returned=cached.response.routes[0];
      if(returned.distance!==route.distanceM||returned.duration!==route.durationSeconds)errors.push(`Cache totals differ ${route.id}`);
      if(cached.requestUrl!==route.provenance.requestUrl)errors.push(`Cache URL differs ${route.id}`);
      if(JSON.stringify(cached.composition??null)!==JSON.stringify(route.provenance.coverageExpansion?.sourceLegs??null))errors.push(`Composition source evidence differs ${route.id}`);
      for(const section of route.provenance.ghatSections) {
        const a=route.waypointIds.indexOf(section.entryPlaceId),z=route.waypointIds.indexOf(section.exitPlaceId);
        const measured=drivingDemand(returned.geometry.coordinates.slice(indices[a],indices[z]+1),section.distanceM);
        if(measured.rating!==section.roadDemand.rating||Math.abs(measured.turnsPer10Km-section.roadDemand.turnsPer10Km)>1e-8)errors.push(`Unreproducible driving demand ${route.id}/${section.ghatId}`);
      }
    }catch(error){errors.push(`${route.id}: ${error.message}`);}
  }
  return {atlas,sources,coverage,errors};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const {atlas,sources,coverage,errors}=await validateFiles();
  if(errors.length){console.error(errors.join('\n'));process.exitCode=1;}
  else console.log(`Validated ${atlas.ghats.length} ghats, ${atlas.beaches.length} beaches, ${atlas.routes.length} routes, ${sources.length} sources, ${coverage.candidates.length} coverage entries and matching cached road geometry.`);
}
