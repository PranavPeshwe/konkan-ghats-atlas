import { readFile, writeFile, readdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { cachedRequest, routed, auditResponse, haversine, simplify, drivingDemand, loadRouteRecord, setRequestBudget } from './prepare-routes.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const load=async file=>JSON.parse(await readFile(resolve(root,file),'utf8'));
const save=(file,data)=>writeFile(resolve(root,file),JSON.stringify(data,null,2)+'\n');
const date='2026-11-11',count=10;
export const routeDigest=route=>createHash('sha256').update(JSON.stringify(route)).digest('hex');
export function primaryGhatId(route, ghats) {
  return route.primaryGhatId??ghats.map(g=>g.id).sort((a,b)=>b.length-a.length).find(id=>route.id.startsWith(`${id}-`));
}
export function nearestCandidates(row, beachIds, prefixDistanceM=0) {
  return row.map((distanceM,i)=>({beachId:beachIds[i],distanceM:distanceM===null?null:prefixDistanceM+distanceM}))
    .filter(r=>Number.isFinite(r.distanceM)&&r.distanceM>0)
    .sort((a,b)=>a.distanceM-b.distanceM||a.beachId.localeCompare(b.beachId));
}
function nearestIndex(points, coordinates, start=0) {
  let distance=Infinity,index=-1;
  for(let i=start;i<points.length;i++){const d=haversine(points[i],coordinates);if(d<distance){distance=d;index=i;}}
  if(distance>3)throw new Error(`Frozen waypoint not retained in display geometry (${distance}m)`);
  return index;
}
async function main() {
  const [atlas,coverage,expansion,sources]=await Promise.all(['data/atlas.json','data/coverage-register.json','data/beach-expansion.json','data/sources.json'].map(load));
  const baseline=atlas.methodology.nearestBeaches?.expansionBaseline??atlas.routes.map(r=>({routeId:r.id,sha256:routeDigest(r)}));
  const originalBeachIds=atlas.methodology.nearestBeaches?.originalBeachIds??atlas.beaches.map(b=>b.id);
  const originalBeaches=new Set(originalBeachIds);
  for(const beach of expansion.beaches)if(!atlas.beaches.some(b=>b.id===beach.id))atlas.beaches.push({...beach,coordinates:beach.requestedCoordinates});
  const templates=atlas.ghats.map(g=>{
    const route=atlas.routes.find(r=>r.kind==='ghat'&&primaryGhatId(r,atlas.ghats)===g.id&&!r.provenance.nearestBeachExpansion&&!r.provenance.coverageExpansion);
    if(!route)throw new Error(`Missing frozen primary-ghat template ${g.id}`);
    const exit=route.provenance.waypointPositions.findIndex(w=>w.role==='ghat-exit');
    if(exit<3)throw new Error(`Missing ordered exit ${g.id}`);
    return {ghat:g,route,prefix:route.provenance.waypointPositions.slice(0,exit+1)};
  });
  const coordinates=[...templates.map(t=>t.prefix.at(-1).coordinates),...atlas.beaches.map(b=>expansion.beaches.find(e=>e.id===b.id)?.requestedCoordinates??b.coordinates)];
  const sourcesQuery=templates.map((_,i)=>i).join(';'),destinations=atlas.beaches.map((_,i)=>i+templates.length).join(';');
  const previous=atlas.methodology.nearestBeaches;
  const priorComparisons=templates.map(t=>previous?.candidateComparisons?.find(c=>c.ghatId===t.ghat.id));
  const reuseTable=previous?.tableCacheFile&&previous.comparedBeachIds?.length===atlas.beaches.length&&
    previous.comparedBeachIds.every((id,i)=>id===atlas.beaches[i].id)&&priorComparisons.every(Boolean);
  const table=reuseTable?{...await load(previous.tableCacheFile),cacheName:previous.tableCacheFile}:
    await cachedRequest('nearest-ten-five-beach-table',coordinates,
      `/table/v1/driving/${coordinates.map(c=>c.join(',')).join(';')}?sources=${sourcesQuery}&destinations=${destinations}&annotations=distance,duration`);
  const tableSourceIndices=templates.map((_,i)=>reuseTable?(priorComparisons[i].tableSourceIndex??i):i);
  if(table.response.code!=='Ok'||tableSourceIndices.some(i=>table.response.distances?.[i]?.length!==atlas.beaches.length))throw new Error(`Invalid comparison table ${table.response.code}`);
  for(const [i,t] of templates.entries())if(haversine(table.response.sources[tableSourceIndices[i]].location,t.prefix.at(-1).coordinates)>3)throw new Error(`Table exit drift ${t.ghat.id}`);
  for(const [i,b] of atlas.beaches.entries()) {
    const snapped=table.response.destinations[i].location;
    if(originalBeaches.has(b.id)) {
      if(haversine(snapped,b.coordinates)>3)throw new Error(`Frozen table destination drift ${b.id}`);
    }else {
      if(haversine(snapped,b.requestedCoordinates)>1200)throw new Error(`New arrival seed too far from road ${b.id}`);
      b.coordinates=snapped;
      b.arrivalNotes='Frozen OSRM car-road snap near beach access, not beach driving or a verified parking place. Final pedestrian approach and current legal access are unverified.';
      b.claims={identity:expansion.beaches.find(e=>e.id===b.id).sourceIds,arrivalCoordinates:['osm','osrm']};
      b.sourceIds=[...new Set([...b.sourceIds,...expansion.beaches.find(e=>e.id===b.id).sourceIds,'osm','osrm'])];b.researchDate=date;
      if(!atlas.places.some(p=>p.id===`arrival-${b.id}`))atlas.places.push({id:`arrival-${b.id}`,name:b.name,aliases:b.aliases,kind:'beach-arrival',coordinates:snapped,sourceIds:b.sourceIds});
    }
  }
  const allCandidates=templates.map((t,i)=>nearestCandidates(table.response.distances[tableSourceIndices[i]],atlas.beaches.map(b=>b.id),t.prefix.at(-1).distanceAlongM));
  if(allCandidates.some(c=>c.length!==atlas.beaches.length))throw new Error('Unreachable numeric comparison; review before generation');
  const best=(ghatId,beachId)=>atlas.routes.filter(r=>r.kind==='ghat'&&primaryGhatId(r,atlas.ghats)===ghatId&&r.beachId===beachId).sort((a,b)=>a.distanceM-b.distanceM||a.id.localeCompare(b.id))[0];
  const union=new Map(),choose=(ghatId,beachId)=>union.set(`${ghatId}/${beachId}`,{ghatId,beachId});
  for(const [i,t] of templates.entries())for(const c of allCandidates[i].slice(0,count))choose(t.ghat.id,c.beachId);
  for(const b of atlas.beaches) {
    const nearest=templates.map((t,i)=>({ghatId:t.ghat.id,...allCandidates[i].find(c=>c.beachId===b.id)})).sort((a,b)=>a.distanceM-b.distanceM||a.ghatId.localeCompare(b.ghatId));
    for(const c of nearest.slice(0,5))choose(c.ghatId,b.id);
  }
  const missing=[...union.values()].filter(c=>!best(c.ghatId,c.beachId));
  const oldMissing=missing.filter(c=>originalBeaches.has(c.beachId)),newMissing=missing.filter(c=>!originalBeaches.has(c.beachId));
  function hubFor(c) {
    const beach=atlas.beaches.find(b=>b.id===c.beachId);
    const ids=new Set([...atlas.routes.filter(r=>r.kind==='ghat'&&primaryGhatId(r,atlas.ghats)===c.ghatId&&originalBeaches.has(r.beachId)).map(r=>r.beachId),...oldMissing.filter(r=>r.ghatId===c.ghatId).map(r=>r.beachId)]);
    return [...ids].map(id=>atlas.beaches.find(b=>b.id===id)).sort((a,b)=>haversine(a.coordinates,beach.coordinates)-haversine(b.coordinates,beach.coordinates)||a.id.localeCompare(b.id))[0];
  }
  const connectors=new Set(newMissing.map(c=>`${hubFor(c).id}/${c.beachId}`));
  const plan={date,ghatCount:templates.length,beachCount:atlas.beaches.length,numericCells:templates.length*atlas.beaches.length,selectedUnionCount:union.size,missingGeometryCount:missing.length,directOriginalBeachRequests:oldMissing.length,sharedDirectedConnectorRequests:connectors.size,initialGeometryRequestEstimate:oldMissing.length+connectors.size,geometryBudget:150,tableCacheFile:table.cacheName,missing};
  if(!atlas.methodology.nearestBeaches?.expansionBaseline)await save('data/coverage-expansion-plan.json',plan);
  console.log(JSON.stringify({...plan,missing:undefined}));
  if(process.argv.includes('--table-only'))return;
  const alreadyRequested=(await readdir(resolve(root,'data/cache'))).filter(f=>/^(coverage-road-|coverage-coast-)/.test(f)).length;
  if(plan.initialGeometryRequestEstimate>150)throw new Error(`Finite budget exceeded: ${plan.initialGeometryRequestEstimate} initial requests; no geometry requests made`);
  setRequestBudget(150-alreadyRequested);
  const beachById=id=>atlas.beaches.find(b=>b.id===id);
  const arrival=b=>({placeId:`arrival-${b.id}`,role:'beach-arrival',coordinates:b.coordinates,onRoute:true});
  const bridges=[
    {id:'coverage-savitribridge',name:'Mahad mainland bridge corridor',coordinates:[73.416,18.083],latitude:17.98},
    {id:'coverage-vashishti',name:'Chiplun mainland bridge corridor',coordinates:[73.531,17.532],latitude:17.57},
    {id:'coverage-shastri',name:'Sangameshwar mainland bridge corridor',coordinates:[73.558,17.175],latitude:17.3},
    {id:'coverage-terekhol',name:'Kiranpani mainland bridge corridor',coordinates:[73.765,15.762],latitude:15.735},
  ];
  async function road(id,positions) {
    let record=await routed(id,positions.map(w=>w.coordinates));
    try {auditResponse(record);return {record,positions};}
    catch(error) {
      if(!error.message.includes('Ferry'))throw error;
      const last=positions.at(-1),start=positions.at(-2),lo=Math.min(start.coordinates[1],last.coordinates[1]),hi=Math.max(start.coordinates[1],last.coordinates[1]);
      const crossing=bridges.filter(b=>b.latitude>lo&&b.latitude<hi).sort((a,b)=>start.coordinates[1]>last.coordinates[1]?b.latitude-a.latitude:a.latitude-b.latitude);
      if(!crossing.length)throw new Error(`Ferry has no reviewed mainland bypass: ${id}`);
      const extra=crossing.map(b=>({placeId:b.id,role:'junction',coordinates:b.coordinates,onRoute:true}));
      const forced=[...positions.slice(0,-1),...extra,last];
      record=await routed(`${id}-mainland`,forced.map(w=>w.coordinates));auditResponse(record);
      for(const [i,b] of crossing.entries()) {
        const coordinates=record.response.waypoints[positions.length-1+i].location;
        if(!atlas.places.some(p=>p.id===b.id))atlas.places.push({id:b.id,name:b.name,aliases:[],kind:'junction',coordinates,sourceIds:['osm','osrm']});
        extra[i].coordinates=coordinates;
      }
      return {record,positions:forced};
    }
  }
  function makeTrip(t,beach,record,inputPositions,composition=false) {
    const indices=auditResponse(record),r=record.response.routes[0],id=`${t.ghat.id}-${beach.id}`;
    if(atlas.routes.some(r=>r.id===id))throw new Error(`Route ID collision ${id}`);
    if(haversine(r.geometry.coordinates[0],atlas.origin.coordinates)>3||haversine(r.geometry.coordinates.at(-1),beach.coordinates)>3)throw new Error(`Frozen endpoint drift ${id}`);
    const positions=inputPositions.map(w=>({...w}));
    const geometry=indices.slice(0,-1).flatMap((a,j)=>simplify(r.geometry.coordinates.slice(a,indices[j+1]+1),20).slice(j?1:0));
    let previous=-1,along=0;
    positions.forEach((w,j)=>{
      if(j)along+=r.legs[j-1].distance;
      if(haversine(w.coordinates,record.response.waypoints[j].location)>3)throw new Error(`Frozen anchor drift ${id}/${j}`);
      w.coordinates=record.response.waypoints[j].location;w.geometryIndex=nearestIndex(geometry,w.coordinates,previous+1);
      previous=w.geometryIndex;w.distanceAlongM=along;w.snapDistanceM=record.response.waypoints[j].distance;w.onRoute=true;
    });
    const ghatSections=t.route.provenance.ghatSections.map(section=>{
      const a=positions.findIndex(w=>w.placeId===section.entryPlaceId),z=positions.findIndex(w=>w.placeId===section.exitPlaceId);
      const distanceM=r.legs.slice(a,z).reduce((sum,l)=>sum+l.distance,0);
      if(distanceM<1000||distanceM>110000)throw new Error(`Implausible ghat section ${id}/${section.ghatId}`);
      return {...section,distanceM,roadDemand:drivingDemand(r.geometry.coordinates.slice(indices[a],indices[z]+1),distanceM)};
    });
    const trip={
      ...structuredClone(t.route),id,name:`${beach.name} via ${t.route.provenance.accessLoop?`${t.ghat.name} access loop`:t.ghat.name}`,
      primaryGhatId:t.ghat.id,beachId:beach.id,waypointIds:positions.map(w=>w.placeId),
      geometry:{type:'LineString',coordinates:geometry},distanceM:r.distance,durationSeconds:r.duration,distanceKm:r.distance/1000,durationHours:r.duration/3600,
      difficulty:Math.max(...ghatSections.map(s=>s.roadDemand.rating)),sourceIds:[...new Set([...t.route.sourceIds,...beach.sourceIds])],
      provenance:{
        ...structuredClone(t.route.provenance),requestUrl:record.requestUrl,cacheFile:record.cacheName,retrievedAt:record.retrievedAt,
        sourceDataVersion:record.dataVersion,researchDate:date,waypointPositions:positions,ghatSections,
        roadDemand:ghatSections.find(s=>s.ghatId===t.ghat.id).roadDemand,
        distanceAndTime:composition?'Sum of complete, forward-only OSRM source legs joined at identical road nodes; not an independently requested whole-trip optimum. Source legs and exact cache references retained.':'Totals from the same complete OSRM returned itinerary.',
        coverageExpansion:{date,templateRouteId:t.route.id,tableCacheFile:table.cacheName,composition,sourceLegs:record.composition??null,accessStops:composition?'Coastal arrival is an explicit intermediate routing stop; final pedestrian access is not modelled.':null},
      },
    };
    atlas.routes.push(trip);console.log(`ADDED ${id}: ${trip.distanceKm.toFixed(1)}km${composition?' (complete directed legs)':''}`);
    return trip;
  }
  async function direct(c) {
    const prior=best(c.ghatId,c.beachId);if(prior)return prior;
    const t=templates.find(t=>t.ghat.id===c.ghatId),beach=beachById(c.beachId);
    const result=await road(`coverage-road-${t.ghat.id}-${beach.id}`,[...t.prefix,arrival(beach)]);
    return makeTrip(t,beach,result.record,result.positions);
  }
  for(const c of oldMissing)await direct(c);
  const coastRecords=new Map();
  async function composed(c) {
    const prior=best(c.ghatId,c.beachId);if(prior)return prior;
    const t=templates.find(t=>t.ghat.id===c.ghatId),beach=beachById(c.beachId),hub=hubFor(c),base=best(c.ghatId,hub.id),key=`${hub.id}/${beach.id}`;
    if(!base)throw new Error(`Missing complete hub itinerary ${c.ghatId}/${hub.id}`);
    let coast=coastRecords.get(key);
    if(!coast){coast=await road(`coverage-coast-${hub.id}-${beach.id}`,[arrival(hub),arrival(beach)]);coastRecords.set(key,coast);}
    const baseRecord=await loadRouteRecord(base.provenance.cacheFile);
    const references=[
      ...baseRecord.response.routes[0].legs.map((_,legIndex)=>({cacheFile:base.provenance.cacheFile,legIndex,reversed:false})),
      ...coast.record.response.routes[0].legs.map((_,legIndex)=>({cacheFile:coast.record.cacheName,legIndex,reversed:false})),
    ];
    const cacheName=`data/cache/composed-${c.ghatId}-${beach.id}.json`;
    const manifest={requestUrl:`osrm-cache-composition:${c.ghatId}-${beach.id}`,retrievedAt:date,dataVersion:null,composition:references,notes:'Derived cache manifest, not a provider response. Exact complete source legs retain provider URLs, geometry, distances and durations; no reversed edges, interpolated roads or synthetic segment metrics.'};
    await save(cacheName,manifest);
    const record=await loadRouteRecord(cacheName);
    return makeTrip(t,beach,record,[...base.provenance.waypointPositions.map((w,i)=>({...w,role:i===base.waypointIds.length-1?'coastal-stop':w.role})),...coast.positions.slice(1)],true);
  }
  for(const c of newMissing)await composed(c);
  function rankGhat(g) {
    return atlas.beaches.map(b=>best(g.id,b.id)).filter(Boolean).sort((a,b)=>a.distanceM-b.distanceM||a.beachId.localeCompare(b.beachId));
  }
  function rankBeach(b) {
    return atlas.ghats.map(g=>best(g.id,b.id)).filter(Boolean).sort((a,b)=>a.distanceM-b.distanceM||primaryGhatId(a,atlas.ghats).localeCompare(primaryGhatId(b,atlas.ghats)));
  }
  let boundaryRounds=0;
  while(true) {
    const additional=new Map(),add=(ghatId,beachId)=>additional.set(`${ghatId}/${beachId}`,{ghatId,beachId});
    for(const [i,t] of templates.entries()) {
      const threshold=rankGhat(t.ghat)[count-1]?.distanceM??Infinity;
      for(const c of allCandidates[i])if(!best(t.ghat.id,c.beachId)&&c.distanceM<=threshold)add(t.ghat.id,c.beachId);
    }
    for(const b of atlas.beaches) {
      const threshold=rankBeach(b)[4]?.distanceM??Infinity;
      for(const [i,t] of templates.entries()) {
        const c=allCandidates[i].find(c=>c.beachId===b.id);
        if(!best(t.ghat.id,b.id)&&c.distanceM<=threshold)add(t.ghat.id,b.id);
      }
    }
    if(!additional.size)break;
    console.log(`Boundary round ${++boundaryRounds}: ${additional.size} additional audited pairs`);
    if(boundaryRounds>10)throw new Error('Comparison boundary did not converge');
    for(const c of additional.values())await (originalBeaches.has(c.beachId)?direct(c):composed(c));
  }
  for(const [i,t] of templates.entries()) {
    const selected=rankGhat(t.ghat).slice(0,count);
    if(selected.length!==count)throw new Error(`Incomplete ten-beach coverage ${t.ghat.id}`);
    t.ghat.nearestBeachIds=selected.map(r=>r.beachId);
    t.ghat.closestBeachRoutes=selected.map(r=>({beachId:r.beachId,routeId:r.id,distanceM:r.distanceM,comparisonDistanceM:allCandidates[i].find(c=>c.beachId===r.beachId).distanceM}));
  }
  for(const b of atlas.beaches) {
    const selected=rankBeach(b).slice(0,5);
    if(selected.length!==5)throw new Error(`Incomplete five-primary-ghat coverage ${b.id}`);
    b.shortestGhatIds=selected.map(r=>primaryGhatId(r,atlas.ghats));
    b.closestGhatRoutes=selected.map(r=>({ghatId:primaryGhatId(r,atlas.ghats),routeId:r.id,distanceM:r.distanceM,comparisonDistanceM:allCandidates[templates.findIndex(t=>t.ghat.id===primaryGhatId(r,atlas.ghats))].find(c=>c.beachId===b.id).distanceM}));
  }
  atlas.adjacencyGraph={
    directed:true,
    meaning:'Requested primary-ghat corridor to beach itinerary edges; traversed approach ghats are annotations, never extra independent alternatives. Highway variants are excluded.',
    routeEdges:atlas.routes.filter(r=>r.kind==='ghat').map(r=>({ghatId:primaryGhatId(r,atlas.ghats),beachId:r.beachId,routeId:r.id,distanceM:r.distanceM,traversedGhatIds:r.ghatIds})),
  };
  atlas.methodology.nearestBeaches={
    count,ghatsPerBeach:5,date,comparedBeachIds:atlas.beaches.map(b=>b.id),originalBeachIds,tableCacheFile:table.cacheName,tableRequestUrl:table.requestUrl,retrievedAt:table.retrievedAt,
    profile:'FOSSGIS car / driving; complete directed-leg ferry audit',
    method:`The cached ${table.response.distances.length}-source/${atlas.beaches.length}-destination table compares the ${templates.length} supported corridors using explicit source-row indices. Each fixed Pune-through-ghat prefix is added to exit-to-beach model distance. The union of ten candidates per ghat and five distinct primary corridors per beach receives full route or exact complete-leg assembly audits. Extra candidates below actual selection boundaries are audited until no unevaluated numeric candidate is shorter. Order uses actual full-trip metres, choosing one best itinerary per requested main ghat, not every physically traversed approach ghat.`,
    limitations:'OSRM model-preferred fastest driving, not global shortest-distance optimization. Composed routes include explicit coastal access stops and sum complete forward-only source legs; they are not an independently optimized whole itinerary. Every leg has actual provider geometry/totals; no straight roads or reversed one-way legs. Table costs may include ferries and waypoint-turn differences; selected routes use audited mainland bypasses. Audited but omitted candidates may have lower provisional numeric costs than their actual ferry-free/stop-constrained totals. Static desk snapshot only, not current road-opening, legal-access, parking or safety verification.',
    retainedRoutes:baseline,expansionBaseline:baseline,
    candidateComparisons:templates.map((t,i)=>({ghatId:t.ghat.id,tableSourceIndex:tableSourceIndices[i],templateRouteId:t.route.id,prefixDistanceM:t.prefix.at(-1).distanceAlongM,candidates:allCandidates[i]})),
    geometryRequestBudget:150,geometryRequestsUsed:(await readdir(resolve(root,'data/cache'))).filter(f=>/^(coverage-road-|coverage-coast-)/.test(f)).length,boundaryRounds:Math.max(boundaryRounds,atlas.methodology.nearestBeaches?.boundaryRounds??0),
  };
  atlas.methodology.normalizationBounds=Object.fromEntries(atlas.beaches.map(b=>{
    const group=atlas.routes.filter(r=>r.beachId===b.id);
    return [b.id,Object.fromEntries(['distanceKm','durationHours','difficulty','scenery','tollCostInr'].map(key=>{
      const values=group.map(r=>r[key]).filter(Number.isFinite);
      return [key,values.length?{min:Math.min(...values),max:Math.max(...values)}:null];
    }))];
  }));
  const originalDescriptionCutoff=atlas.methodology.beachExpansion?.originalDescriptionCutoff??atlas.researchDate;
  atlas.methodology.beachExpansion={date,identitySourceManifest:'data/beach-expansion.json',originalDescriptionCutoff,addedBeachCount:expansion.beaches.length,arrivalDefinition:'Car-road snaps near access; never sand driving or a parking guarantee.'};
  atlas.researchDate=date;
  coverage.researchDate=date;
  atlas.methodology.snapshot='Original ghat/22-beach description cutoff: 10 November 2026. Added-beach identity research and coverage expansion: 11 November 2026. Provider caches retain actual retrieval timestamps; composed caches identify their assembly date and source legs. No retrieval or assembly certifies current road conditions.';
  atlas.methodology.sourceData='data/research.mjs contains the original baseline inputs; data/beach-expansion.json contains the 11 November added-beach identity sources and coordinate seeds; data/cache/ retains full provider responses and explicit complete-leg composition manifests.';
  const coverageNote=`Destination expansion researched 11 November 2026: ${atlas.beaches.length} distinct beaches, ten per ghat and five distinct primary corridors per beach; original descriptive cutoff and ${baseline.length} original itineraries for supported ghats retained.`;
  if(!atlas.methodology.coverage.includes(coverageNote))atlas.methodology.coverage+=` ${coverageNote}`;
  coverage.destinationCoverage={date,beachesPerGhat:count,ghatsPerBeach:5,comparedBeachCount:atlas.beaches.length,tableCacheFile:table.cacheName,routeCount:atlas.routes.length};
  for(const c of coverage.candidates)if(c.status==='included')c.routeIds=atlas.routes.filter(r=>r.ghatIds.includes(c.id)).map(r=>r.id);
  for(const source of expansion.sources) {
    const entry={...source,retrievedAt:date,verifiedAt:null,license:'Reference only; original factual paraphrase, no page text or images redistributed.',verificationScope:'Identity desk research on 11 November 2026; no field or live road-status verification.'};
    const index=sources.findIndex(s=>s.id===source.id);
    if(index<0)sources.push(entry);else sources[index]=entry;
  }
  await save('data/atlas.json',atlas);await save('data/coverage-register.json',coverage);await save('data/sources.json',sources);
  console.log(`Saved ${atlas.routes.length} routes; ${atlas.beaches.length} beaches; max intermediate waypoints ${Math.max(...atlas.routes.map(r=>r.waypointIds.length-2))}; geometry calls ${atlas.methodology.nearestBeaches.geometryRequestsUsed}/150.`);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
