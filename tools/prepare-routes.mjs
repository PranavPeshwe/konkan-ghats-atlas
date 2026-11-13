import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { researchDate, sources, corridors, beaches, extraCandidates } from '../data/research.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const path = name => resolve(root, name);
const save = (name, value) => writeFile(path(name), JSON.stringify(value, null, 2) + '\n');
const origin = { id:'pune', name:'Pune · Bajirao Road near Shaniwar Wada', coordinates:[73.854499,18.519479], sourceIds:['pune-origin','osm','osrm'], requestedCoordinates:[73.8553,18.5195], accessNotes:'Car-network reference adjacent to the landmark, not inside the monument. Desk-verified by OSRM snap; no on-site access check.',verifiedAt:null };
const endpoint = process.env.OSRM_BASE_URL || 'https://routing.openstreetmap.de/routed-car';
const refresh = process.argv.includes('--fetch');
let lastRequest = 0;
let requestBudget=Infinity, requestsMade=0;
export function setRequestBudget(remaining) { requestBudget=remaining;requestsMade=0; }
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
export function haversine(a,b) {
  const rad = Math.PI/180, p=(b[1]-a[1])*rad, q=(b[0]-a[0])*rad;
  return 6371000*2*Math.atan2(Math.sqrt(Math.sin(p/2)**2+Math.cos(a[1]*rad)*Math.cos(b[1]*rad)*Math.sin(q/2)**2),Math.sqrt(1-(Math.sin(p/2)**2+Math.cos(a[1]*rad)*Math.cos(b[1]*rad)*Math.sin(q/2)**2)));
}
function segmentDistance(p,a,b) {
  const scale=Math.cos(p[1]*Math.PI/180), x=(p[0]-a[0])*scale,y=p[1]-a[1], dx=(b[0]-a[0])*scale,dy=b[1]-a[1];
  const t=dx||dy?Math.max(0,Math.min(1,(x*dx+y*dy)/(dx*dx+dy*dy))):0;
  return Math.hypot(x-t*dx,y-t*dy)*111320;
}
export function simplify(points, tolerance=20) {
  if(points.length<=2)return points;
  const keep=new Set([0,points.length-1]), stack=[[0,points.length-1]];
  while(stack.length) {
    const [a,b]=stack.pop();let maximum=tolerance,index=-1;
    for(let i=a+1;i<b;i++){const d=segmentDistance(points[i],points[a],points[b]);if(d>maximum){maximum=d;index=i;}}
    if(index>=0){keep.add(index);stack.push([a,index],[index,b]);}
  }
  // Keep original vertices often enough that a simplified line cannot conceal a long join.
  let distance=0;
  for(let i=1;i<points.length;i++){distance+=haversine(points[i-1],points[i]);if(distance>500){keep.add(i);distance=0;}}
  return [...keep].sort((a,b)=>a-b).map(i=>points[i]);
}
export function drivingDemand(points, distanceM) {
  const sampled=[points[0]];let accumulated=0;
  for(let i=1;i<points.length;i++){
    const length=haversine(points[i-1],points[i]);
    let remaining=length, start=points[i-1];
    while(accumulated+remaining>=100) {
      const t=(100-accumulated)/remaining;
      const p=[start[0]+(points[i][0]-start[0])*t,start[1]+(points[i][1]-start[1])*t];
      sampled.push(p);remaining-=100-accumulated;start=p;accumulated=0;
    }
    accumulated+=remaining;
  }
  let significantTurns=0;
  for(let i=1;i<sampled.length-1;i++){
    const [a,b,c]=sampled.slice(i-1,i+2),scale=Math.cos(b[1]*Math.PI/180);
    const x=(b[0]-a[0])*scale,y=b[1]-a[1],u=(c[0]-b[0])*scale,v=c[1]-b[1];
    const angle=Math.acos(Math.max(-1,Math.min(1,(x*u+y*v)/(Math.hypot(x,y)*Math.hypot(u,v)))))*180/Math.PI;
    if(angle>=35)significantTurns++;
  }
  const turnsPer10Km=significantTurns/(distanceM/10000);
  const rating=turnsPer10Km<10?1:turnsPer10Km<20?2:turnsPer10Km<30?3:turnsPer10Km<40?4:5;
  return {rating,significantTurns,turnsPer10Km,sampleSpacingM:100,turnThresholdDeg:35,notes:'Editorial curves-only driving-demand proxy from returned section geometry; not road width, gradient, surface, traffic, legal access, driver ability or safety.'};
}
export async function cachedRequest(id, coordinates, query) {
  const key=createHash('sha256').update(endpoint+query).digest('hex').slice(0,20);
  const cacheName=`data/cache/${id}-${key}.json`;
  try {
    const cached=JSON.parse(await readFile(path(cacheName),'utf8'));
    if(cached.httpStatus&&cached.httpStatus!==200)throw new Error(`Routing ${id}: cached HTTP ${cached.httpStatus}: ${cached.response.message??cached.response.code}`);
    return {...cached,cacheName};
  }
  catch(error) { if(error.code!=='ENOENT')throw error; }
  if(!refresh)throw new Error(`Missing ${cacheName}. Use --fetch only after reviewing provider policy; prefer OSRM_BASE_URL pointing to your own server.`);
  if(requestsMade>=requestBudget)throw new Error(`Finite geometry request budget exhausted (${requestBudget}); no further requests made.`);
  requestsMade++;
  await sleep(Math.max(0,1250-(Date.now()-lastRequest)));
  lastRequest=Date.now();
  const url=endpoint+query;
  const response=await fetch(url,{headers:{'User-Agent':'KonkanGhatAtlas/1.0 (finite cached educational route research; no runtime API)'},signal:AbortSignal.timeout(90000)});
  const result=await response.json();
  const record={requestUrl:url,requestedCoordinates:coordinates,retrievedAt:new Date().toISOString(),dataVersion:result.data_version??null,response:result,...(!response.ok?{httpStatus:response.status}:{})};
  await save(cacheName,record);
  if(!response.ok)throw new Error(`Routing ${id}: HTTP ${response.status}: ${result.message??result.code}; generation stopped, no retry storm.`);
  return {...record,cacheName};
}
export async function routed(id, coordinates, { excludeFerry=false }={}) {
  const query = `/route/v1/driving/${coordinates.map(c=>c.join(',')).join(';')}?overview=full&geometries=geojson&steps=true&continue_straight=false${excludeFerry?'&exclude=ferry':''}`;
  return cachedRequest(id,coordinates,query);
}
export async function loadRouteRecord(cacheFile) {
  const record=JSON.parse(await readFile(path(cacheFile),'utf8'));
  if(!record.composition)return {...record,cacheName:cacheFile};
  const legs=[],waypoints=[],coordinates=[];
  for(const reference of record.composition) {
    if(reference.reversed!==false)throw new Error(`Reversed cached leg prohibited: ${cacheFile}`);
    const source=await loadRouteRecord(reference.cacheFile),indices=auditResponse(source);
    const leg=source.response.routes[0].legs[reference.legIndex];
    if(!leg)throw new Error(`Missing complete source leg: ${cacheFile}`);
    const a=source.response.waypoints[reference.legIndex],b=source.response.waypoints[reference.legIndex+1];
    const points=source.response.routes[0].geometry.coordinates.slice(indices[reference.legIndex],indices[reference.legIndex+1]+1);
    if(waypoints.length) {
      if(haversine(waypoints.at(-1).location,a.location)>0.01||haversine(coordinates.at(-1),points[0])>0.01)throw new Error(`Nonidentical cached-leg join: ${cacheFile}`);
    }else waypoints.push(a);
    waypoints.push(b);legs.push(leg);coordinates.push(...points.slice(coordinates.length?1:0));
  }
  const route={distance:legs.reduce((s,l)=>s+l.distance,0),duration:legs.reduce((s,l)=>s+l.duration,0),geometry:{type:'LineString',coordinates},legs};
  return {...record,cacheName:cacheFile,requestedCoordinates:waypoints.map(w=>w.location),response:{code:'Ok',routes:[route],waypoints}};
}
const placeMap=new Map();
function place(name,coordinates,kind,sourceIds,id) {
  id ||= name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  if(!placeMap.has(id))placeMap.set(id,{id,name,aliases:[],kind,coordinates,sourceIds});
  return id;
}
function nearestIndex(points,p,start=0) {
  let best=-1,distance=Infinity;
  for(let i=start;i<points.length;i++){const d=haversine(points[i],p);if(d<distance){distance=d;best=i;}}
  return {index:best,distance};
}
export function auditResponse(record) {
  const {response,requestedCoordinates}=record;
  if(response.code!=='Ok'||response.routes?.length!==1)throw new Error(`No unique returned route (${response.code})`);
  const route=response.routes[0], coordinates=route.geometry?.coordinates;
  if(!coordinates||coordinates.length<10||route.legs.length!==requestedCoordinates.length-1)throw new Error('Missing complete road geometry / legs');
  if(response.waypoints.length!==requestedCoordinates.length)throw new Error('Missing routing waypoints');
  if(route.legs.some(l=>l.steps.some(s=>s.mode==='ferry'||s.intersections?.some(i=>i.classes?.includes('ferry')))))throw new Error('Ferry itinerary rejected');
  for(let i=0;i<response.waypoints.length;i++) {
    const snap=response.waypoints[i];
    if(snap.distance>1200)throw new Error(`Anchor ${i} snapped ${snap.distance.toFixed(0)}m: corridor review needed`);
  }
  let previous=0;
  const indices=response.waypoints.map(w=>{
    const located=nearestIndex(coordinates,w.location,previous);
    if(located.distance>35)throw new Error(`Waypoint is ${located.distance.toFixed(0)}m from geometry`);
    previous=located.index;return located.index;
  });
  if(indices.some((v,i)=>i>0&&v<=indices[i-1]))throw new Error('Collapsed or non-progressing ordered anchor');
  // Full OSM geometry can legitimately contain long straight highway/tunnel edges.
  // Detect exceptional joins, not ordinary sparse surveyed vertices.
  for(let i=1;i<coordinates.length;i++)if(haversine(coordinates[i-1],coordinates[i])>5000)throw new Error('Exceptional source geometry join requires road review');
  const metres=route.legs.reduce((s,l)=>s+l.distance,0),seconds=route.legs.reduce((s,l)=>s+l.duration,0);
  if(Math.abs(metres-route.distance)>2||Math.abs(seconds-route.duration)>2)throw new Error('Inconsistent totals');
  return indices;
}
async function main() {
  await mkdir(path('data/cache'),{recursive:true});
  if(process.argv.includes('--review-candidates')) {
    const audit=JSON.parse(await readFile(path('data/candidate-road-audit.json'),'utf8'));
    const reviewed=JSON.parse(await readFile(path('data/anchor-review.json'),'utf8'));
    for(const [id,auditId,ref] of [['amboli-nashik','trimbak-jawhar','NH160A'],['pargad','pargad','ODR'],['anashi','anashi','SH34']]) {
      const c=corridors.find(c=>c.id===id),source=audit.find(a=>a.id===auditId);
      const record=JSON.parse(await readFile(path(source.cacheFile),'utf8'));
      const vertices=record.response.routes[0].legs.flatMap(l=>l.steps.filter(s=>s.ref===ref).flatMap(s=>s.geometry.coordinates));
      const anchors=c.anchors.map((p,i)=>id==='pargad'&&i===2?p:vertices[nearestIndex(vertices,p).index]);
      reviewed[id]={roadRef:ref,cacheFile:source.cacheFile,anchors,notes:'Candidate seeds refined to actual cached main-road vertices; Pargad exit is an exact cached Mirvel-road vertex. Named road and geographic corridor sources remain separately cited.'};
    }
    await save('data/anchor-review.json',reviewed);console.log('Frozen three additional main-road corridors.');return;
  }
  if(process.argv.includes('--review-anchors')) {
    const refs={kasara:'NH160',bor:'NH48',tamhini:'NH753F',varandha:'NH965DD',ambenali:'SH72',amba:'NH166'};
    const reviewed={};
    for(const [id,ref] of Object.entries(refs)) {
      const c=corridors.find(c=>c.id===id);
      const file=(await readdir(path('data/cache'))).find(f=>f.startsWith(`${id}-`));
      const record=JSON.parse(await readFile(path(`data/cache/${file}`),'utf8'));
      const vertices=record.response.routes[0].legs.flatMap(l=>l.steps.filter(s=>s.ref?.split(';').map(s=>s.trim()).includes(ref)).flatMap(s=>s.geometry.coordinates));
      if(!vertices.length)throw new Error(`No named road evidence ${id}/${ref}`);
      reviewed[id]={roadRef:ref,cacheFile:`data/cache/${file}`,anchors:c.anchors.map(p=>vertices[nearestIndex(vertices,p).index]),notes:'Entry/interior/exit seeds refined to actual returned geometry vertices on the named main-road reference, excluding nearby side-spur snaps.'};
    }
    await save('data/anchor-review.json',reviewed);
    console.log(JSON.stringify(reviewed,null,2));return;
  }
  const anchorReview=JSON.parse(await readFile(path('data/anchor-review.json'),'utf8').catch(error=>{if(error.code==='ENOENT')return '{}';throw error;}));
  for(const c of corridors)if(anchorReview[c.id])c.anchors=anchorReview[c.id].anchors;
  const ghats=corridors.map(c=>({
    id:c.id,name:c.name,aliases:c.aliases,region:c.region,coordinates:c.anchors[1],summary:c.summary,description:c.description,
    difficulty:null,scenery:c.scenery,lengthKm:null,elevationM:null,
    seasonalNotes:'Monsoon rain, mist and landslides may disrupt travel. Check current local restrictions before departure; this snapshot has no live road-condition verification.',
    accessNotes:'Documented public-road corridor plus OSM car-network itinerary; not field-verified and not an assurance of present permission, opening or road quality.',
    waypoints:[],sourceIds:[...c.sources,'osm','osrm'],
    claims:{identity:c.sources,corridor:c.sources,coordinates:['osm','osrm'],lengthKm:['osrm'],elevationM:[],difficulty:[],scenery:c.scenery===null?[]:c.sources},
    measurementNotes:'lengthKm is the returned car-road length between the selected entry and exit anchors; not a surveyed/legal definition of the entire ghat. Elevation and objective driving difficulty are unknown.',
  }));
  const itineraries=corridors.flatMap(c=>c.beaches.map(beach=>({id:`${c.id}-${beach}`,corridor:c,beach,kind:'ghat'})));
  // Practical highway-biased comparators still descend the Sahyadri; never label ghat-free.
  itineraries.push(...['alibag','kashid','diveagar'].map(beach=>({id:`highway-${beach}`,cacheId:`expressway-${beach}`,corridor:corridors.find(c=>c.id==='bor'),beach,kind:'highway',highwayConnector:true})));
  const routes=[],rejections=[];
  for(const itinerary of itineraries) {
    const c=itinerary.corridor,beach=beaches.find(b=>b.id===itinerary.beach),ghat=ghats.find(g=>g.id===c.id);
    const towns=c.towns.map(([name,lng,lat])=>({name,coordinates:[lng,lat],role:'town'}));
    const anchors=c.anchors.map((coordinates,i)=>({name:`${c.name} · ${['plateau entry','interior anchor','Konkan exit'][i]}`,coordinates,role:['ghat-entry','ghat-interior','ghat-exit'][i]}));
    if(itinerary.highwayConnector) {
      // This is a highway-connector variant, not a claim of expressway-only travel.
      anchors[0].coordinates=[73.410,18.775];anchors[1].coordinates=[73.354,18.790];anchors[2].coordinates=[73.299,18.807];
      anchors.forEach(a=>{a.name=a.name.replace(c.name,'Khopoli highway connector');});
    }
    const avoidsFerry=[];
    if(c.id==='kumbharli'&&beach.id==='ganpatipule')avoidsFerry.push({name:'Sangameshwar bridge corridor',coordinates:[73.558,17.175],role:'junction'});
    if(c.id==='amba'&&beach.id==='guhagar')avoidsFerry.push({name:'Chiplun bridge corridor',coordinates:[73.531,17.532],role:'junction'});
    const approach=c.approachGhatId?corridors.find(item=>item.id===c.approachGhatId):null;
    const approachAnchors=approach?approach.anchors.map((coordinates,i)=>({name:`${approach.name} · ${['plateau entry','interior anchor','Konkan exit'][i]}`,coordinates,role:['approach-entry','approach-interior','approach-exit'][i]})):[];
    const stops=[{name:origin.name,coordinates:origin.coordinates,role:'origin'},...towns,...approachAnchors,...anchors,...avoidsFerry,{name:beach.name,coordinates:beach.coordinates,role:'beach-arrival'}];
    try {
      const record=await routed(itinerary.cacheId??itinerary.id,stops.map(s=>s.coordinates));
      const indices=auditResponse(record),r=record.response.routes[0];
      const waypointIds=stops.map((s,i)=>place(s.name,record.response.waypoints[i].location,s.role,['osm','osrm',...c.sources],i===0?origin.id:i===stops.length-1?`arrival-${beach.id}`:undefined));
      const positions=stops.map((s,i)=>({placeId:waypointIds[i],role:s.role,geometryIndex:indices[i],distanceAlongM:r.legs.slice(0,i).reduce((sum,l)=>sum+l.distance,0),coordinates:record.response.waypoints[i].location,snapDistanceM:record.response.waypoints[i].distance,onRoute:true}));
      const start=stops.findIndex(s=>s.role==='ghat-entry'),end=stops.findIndex(s=>s.role==='ghat-exit');
      const sectionDistance=r.legs.slice(start,end).reduce((sum,l)=>sum+l.distance,0);
      if(sectionDistance>110000||sectionDistance<1000)throw new Error(`Implausible anchor-defined section ${sectionDistance/1000}km`);
      const demand=drivingDemand(r.geometry.coordinates.slice(indices[start],indices[end]+1),sectionDistance);
      const ghatSections=[{ghatId:c.id,entryPlaceId:waypointIds[start],interiorPlaceId:waypointIds[start+1],exitPlaceId:waypointIds[end],distanceM:sectionDistance,roadDemand:demand}];
      if(approach) {
        const a=stops.findIndex(s=>s.role==='approach-entry'),z=a+2,d=r.legs.slice(a,z).reduce((sum,l)=>sum+l.distance,0);
        ghatSections.unshift({ghatId:approach.id,entryPlaceId:waypointIds[a],interiorPlaceId:waypointIds[a+1],exitPlaceId:waypointIds[z],distanceM:d,roadDemand:drivingDemand(r.geometry.coordinates.slice(indices[a],indices[z]+1),d)});
      }
      // Simplify per leg so every routing waypoint remains an actual geometry vertex.
      const geometryCoordinates=indices.slice(0,-1).flatMap((a,i)=>simplify(r.geometry.coordinates.slice(a,indices[i+1]+1)).slice(i?1:0));
      let previousDisplayIndex=-1;
      const displayPositions=positions.map(p=>{
        const located=nearestIndex(geometryCoordinates,p.coordinates,previousDisplayIndex+1);
        previousDisplayIndex=located.index;
        return {...p,geometryIndex:located.index};
      });
      const trip={
        id:itinerary.id,name:`${beach.name} via ${itinerary.highwayConnector?'Khopoli highway connector':c.accessLoop?`${c.name} access loop`:c.name}`,beachId:beach.id,originId:origin.id,ghatIds:approach?[approach.id,c.id]:[c.id],kind:itinerary.kind,waypointIds,
        geometry:{type:'LineString',coordinates:geometryCoordinates},distanceM:r.distance,durationSeconds:r.duration,distanceKm:r.distance/1000,durationHours:r.duration/3600,
        difficulty:Math.max(...ghatSections.map(s=>s.roadDemand.rating)),scenery:c.scenery,tollCostInr:null,
        sourceIds:[...new Set(['osm','osrm',...c.sources,...(approach?.sources??[]),...beach.sourceIds])],
        provenance:{engine:'OSRM',profile:'FOSSGIS car / driving',provider:endpoint,requestUrl:record.requestUrl,cacheFile:record.cacheName,retrievedAt:record.retrievedAt,researchDate,sourceDataVersion:record.dataVersion,verifiedAt:null,verificationScope:'Automated geometry, ordered-anchor, snapping, ferry and totals checks; not field/legal/current-status verification.',geometryFormat:'OSRM full GeoJSON simplified to <=20m perpendicular deviation; original full response retained.',waypointPositions:displayPositions,ghatSections:[{ghatId:c.id,entryPlaceId:waypointIds[start],interiorPlaceId:waypointIds[start+1],exitPlaceId:waypointIds[end],distanceM:sectionDistance}],distanceAndTime:'Both are totals from the same returned OSRM route/profile, not recomputed from simplified display coordinates.',estimateNotes:'Model driving time excludes live traffic, rest stops, parking, fuel, queues, current road works and restrictions.',ferryAudit:'No ferry mode or ferry intersection class in returned steps.',editorialNotes:'Scenery is a corridor-level editorial preference proxy, not a measured whole-trip landscape score. Difficulty and tolls remain unknown.',claims:{geometry:['osm','osrm'],distanceM:['osrm'],durationSeconds:['osrm'],scenery:c.scenery===null?[]:c.sources,tollCostInr:[],difficulty:[]}},
      };
      trip.provenance.ghatSections=ghatSections;
      trip.provenance.roadDemand=demand;
      trip.provenance.editorialNotes='Difficulty is an editorial curves-only driving-demand proxy measured from road geometry; scenery is an editorial corridor preference, not a measured whole-trip landscape score. Neither is a safety assurance. Tolls remain unknown.';
      trip.provenance.claims.difficulty=['osm','osrm'];
      if(c.accessLoop)trip.provenance.accessLoop='Public Khed–Shindi village crossing: approached uphill from the Konkan side and retraced after the upper anchor. This route also descends Ambenali. No direct independent Mahabaleshwar–Shindi motor-through connection is asserted.';
      routes.push(trip);
      if(ghat.lengthKm===null&&!itinerary.highwayConnector) {ghat.lengthKm=sectionDistance/1000;ghat.waypoints=waypointIds.slice(start,end+1);ghat.coordinates=positions[start+1].coordinates;ghat.difficulty=demand.rating;ghat.roadDemand=demand;ghat.claims.difficulty=['osm','osrm'];ghat.measurementNotes='lengthKm is the selected anchor-defined section, not the full itinerary. Difficulty is an editorial curves-only proxy from 100m geometry sampling, not surface/width/grade or safety. Elevation unknown.';}
      console.log(`OK ${itinerary.id}: ${(r.distance/1000).toFixed(1)}km ${(r.duration/3600).toFixed(1)}h; ghat ${(sectionDistance/1000).toFixed(1)}km; snaps ${record.response.waypoints.map(w=>Math.round(w.distance)).join('/')}`);
    } catch(error) {
      if(error.message.startsWith('Missing ')||/HTTP|fetch|timeout/i.test(error.message))throw error;
      rejections.push({id:itinerary.id,reason:error.message});console.error(`REJECT ${itinerary.id}: ${error.message}`);
    }
  }
  for(const beach of beaches) {
    const arrival=placeMap.get(`arrival-${beach.id}`);
    beach.requestedCoordinates=beach.coordinates;
    if(arrival)beach.coordinates=arrival.coordinates;
    beach.claims={identity:beach.sourceIds.filter(id=>id!=='osm'),arrivalCoordinates:['osm','osrm']};
  }
  const normalizationBounds=Object.fromEntries(beaches.map(b=>{
    const group=routes.filter(r=>r.beachId===b.id);
    return [b.id,Object.fromEntries(['distanceKm','durationHours','difficulty','scenery','tollCostInr'].map(key=>{
      const values=group.map(r=>r[key]).filter(Number.isFinite);return [key,values.length?{min:Math.min(...values),max:Math.max(...values)}:null];
    }))];
  }));
  const atlas={version:'1.0.0',researchDate,origin,ghats:ghats.filter(g=>routes.some(r=>r.ghatIds.includes(g.id))),beaches,places:[...placeMap.values()],routes,methodology:{
    snapshot:'Research cutoff 10 November 2026. Retrieval timestamps are actual API retrieval times, not verification of road conditions.',
    coverage:'Complete itinerary coverage of the explicitly enumerated confirmed documented-road baseline, including the Trimbak–Jawhar northern alternative and Anashi southern Goa approach. Historic walking passes, aliases and unconfirmed direct links have evidence-based dispositions in coverage-register.json. Not a claim of universal road discovery or current opening.',
    routing:'Finite one-time curated requests, one connection, >=1.25s between requests, identified application User-Agent, persistent response cache. No API at application runtime.',
    origin:origin.accessNotes,endpoints:'Same frozen origin and one fixed beach road-arrival point per destination. Named anchor/town locations are OSM-snapped road references, not promises of visitor parking or stopping permission.',
    geometry:'Road-following full OSRM response retained in cache; display simplification never joins the seed points as substitute roads. Ordered entry/interior/exit anchors audited, all waypoints retained. No Google-derived geometry.',
    ghatLength:'Anchor-defined segment length from OSRM legs, not the full itinerary and not a universal ghat boundary. Elevation is unknown; no peak elevations substituted.',
    scoring:{difficulty:{type:'editorial curves-only driving demand, ordinal 1–5',rubric:'Sample the returned full ghat-section road line every100m; count direction changes >=35 degrees. Turns per10km: <10 gives1, 10–<20 gives2, 20–<30 gives3, 30–<40 gives4, >=40 gives5. Thresholds are disclosed editorial categories, not a calibrated engineering standard.',description:'Measures steering/curvature demand only. Does not infer lane width, surface, gradients, traffic, weather, legal access, driver ability or safety. Statistics and sampling parameters are retained per section.',routeAggregation:'Maximum curves-only rating across named traversed ghat sections; not an assessment of every kilometre of the journey.'},scenery:{type:'editorial ordinal 1–5',rubric:'1 utilitarian corridor; 2 limited documented landscape interest; 3 mixed transport corridor and documented mountain/forest setting; 4 documented forest/mountain road attraction; 5 dedicated official ghat attraction with documented waterfall/escarpment setting. Null when descriptive evidence is insufficient.',routeAggregation:'Uses selected ghat corridor rating only, not a claim about every kilometre of the full journey. No safety assurance.'},tolls:'Unknown. Absence of a sourced toll amount is not a zero-toll claim. If toll weight is active, ranking must remain explicitly incomplete; do not silently substitute zero.'},
    seasons:'Monsoon landscape references are not recommendations to drive during storms. No active closure/weather/access verification.',
    knownLimitations:['The confirmed documented-road baseline is explicit and finite, not a claim of universal discovery.','The Namkhol spur and Mangeli border-road completion are separately blocked link claims; no geometry invented.','Car routing is a static graph model, not verification of a legally open road today.','No elevation/toll measurements or whole-road safety assessment; difficulty is only a geometry-derived editorial curves proxy.'],
    normalizationBounds,attribution:'© OpenStreetMap contributors · ODbL 1.0 · Routing: OSRM / FOSSGIS',licenseFile:'DATA-LICENSE.txt',sourceData:'data/research.mjs and data/cache/ contain distributable generator inputs and full responses.',
  }};
  const candidates=[...corridors.map(c=>({id:c.id,name:c.name,aliases:c.aliases,latitude:c.anchors[1][1],status:routes.some(r=>r.ghatIds.includes(c.id))?'included':'unresolved-routing',rationale:c.accessLoop?'Official PWD and reserve visitor-access evidence establishes the public village crossing. Included only with explicit Ambenali + uphill-and-return access-loop geometry; no independent direct Pune plateau shortcut is claimed. Current opening not verified.':'Official corridor identity cross-checked against an OSM car-road route with ordered entry/interior/exit anchors; current opening not verified.',sourceIds:[...c.sources,'osm','osrm'],routeIds:routes.filter(r=>r.ghatIds.includes(c.id)).map(r=>r.id)})),...extraCandidates].sort((a,b)=>b.latitude-a.latitude);
  await save('data/atlas.json',atlas);
  await save('data/sources.json',sources);
  const baselineComplete=corridors.every(c=>routes.some(r=>r.ghatIds.includes(c.id)));
  await save('data/coverage-register.json',{researchDate,scope:'Pune-to-curated Maharashtra and Goa beaches: Maharashtra-side northern Trimbak–Jawhar alternative through all confirmed documented plateau–Konkan corridors, plus Goa gateways and neighboring Anashi–Karwar approach to Canacona. Excludes a Gujarat coastal excursion and more southerly Karnataka beach excursions by destination-catchment rule, not arbitrary latitude or maximum detour.',completeness:`${baselineComplete?'Complete':'Incomplete'} itinerary coverage of the ${corridors.length} explicitly enumerated confirmed documented-road baseline corridors. This is not a universal discovery or current-opening claim. Proposed/unconfirmed direct links and historic walking passes are individually dispositioned.`,baseline:{id:'documented-road-v2',confirmedRoadCoverageComplete:baselineComplete,expectedGhatIds:corridors.map(c=>c.id),accessLoopGhatIds:corridors.filter(c=>c.accessLoop).map(c=>c.id),eligibility:'Official modern road/visitor-access evidence plus connected OSM car geometry. Gazetteer-only historic trails are not assumed modern roads. Public corridor identity is distinct from current opening.',northernRule:'Include the documented Maharashtra-side Trimbak–Jawhar connection rather than stopping at Kasara; Gujarat/Daman-facing routes are outside the selected coastal catchment.',southernRule:'Include neighboring Anashi–Kadra–Karwar as a direct south-Goa approach; do not extend to unrelated Karnataka beach destinations.'},discoverySources:['maps','botanical','tourism-ghats','sindhudurg-plan','marathi-ghats','savantvadi-passes','trimbak-road','tillari-road','goa-roads','anashi-road'],networkAudit:'OSRM car graph tested for each included entry/interior/exit corridor; ferry and collapsed-snap rejection; main-road anchor refinement. Specific proposed/foot-pass audits retained in candidate-road-audit.json. No complete every-road GIS cut-line or field survey is claimed.',specificBlockedClaims:candidates.filter(c=>c.status.startsWith('blocked-')).map(c=>({id:c.id,reason:c.rationale,sourceIds:c.sourceIds})),candidates,rejectedItineraries:rejections});
  console.log(`Saved ${atlas.ghats.length} ghats, ${beaches.length} beaches, ${routes.length} routes; ${rejections.length} rejected.`);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
