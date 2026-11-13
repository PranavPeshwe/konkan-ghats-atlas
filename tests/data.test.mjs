import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateData, validateFiles } from '../tools/validate-data.mjs';
import { auditResponse, drivingDemand, loadRouteRecord } from '../tools/prepare-routes.mjs';
import { nearestCandidates, primaryGhatId } from '../tools/expand-beach-routes.mjs';

const read=async name=>JSON.parse(await readFile(new URL(`../data/${name}`,import.meta.url),'utf8'));
const [atlas,sources,coverage]=await Promise.all(['atlas.json','sources.json','coverage-register.json'].map(read));
test('all catalog records, ordered anchors, equivalent endpoints and raw route metrics validate',async()=>{
  assert.deepEqual((await validateFiles()).errors,[]);
});
test('endpoint drift and active-metric unknowns cannot be silently replaced',()=>{
  const modified=structuredClone(atlas);
  modified.routes[0].geometry.coordinates.at(-1)[0]+=0.01;
  modified.routes[0].distanceKm=0;
  modified.routes[0].difficulty=0;
  const errors=validateData(modified,sources,coverage);
  assert.ok(errors.some(e=>e.startsWith('Inconsistent destination')));
  assert.ok(errors.some(e=>e.startsWith('Invalid metrics')));
  assert.ok(errors.some(e=>e.startsWith('Invalid ranking input')));
});
test('missing crossing coverage and collapsed anchor order are rejected',()=>{
  const modified=structuredClone(atlas),register=structuredClone(coverage);
  modified.routes[0].provenance.waypointPositions[2].geometryIndex=0;
  register.candidates=register.candidates.filter(c=>c.id!==modified.ghats[0].id);
  const errors=validateData(modified,sources,register);
  assert.ok(errors.some(e=>e.startsWith('Unordered waypoint')));
  assert.ok(errors.some(e=>e.startsWith('Included crossing missing')));
});
test('the response audit rejects ferries, non-routes and excessive snapping',async()=>{
  const cached=JSON.parse(await readFile(new URL(`../${atlas.routes[0].provenance.cacheFile}`,import.meta.url),'utf8'));
  const ferry=structuredClone(cached);ferry.response.routes[0].legs[0].steps[0].mode='ferry';
  assert.throws(()=>auditResponse(ferry),/Ferry/);
  const ferryClass=structuredClone(cached);ferryClass.response.routes[0].legs[0].steps[0].intersections=[{classes:['ferry']}];
  assert.throws(()=>auditResponse(ferryClass),/Ferry/);
  const failed=structuredClone(cached);failed.response.code='NoRoute';
  assert.throws(()=>auditResponse(failed),/No unique/);
  const badSnap=structuredClone(cached);badSnap.response.waypoints[1].distance=5000;
  assert.throws(()=>auditResponse(badSnap),/corridor review/);
});
test('every ghat has ten unique audited arrivals, ordered by full driving distance after all-beach comparison',()=>{
  assert.ok(atlas.beaches.length>=35);
  assert.equal(atlas.methodology.nearestBeaches.comparedBeachIds.length,atlas.beaches.length);
  for(const g of atlas.ghats) {
    assert.equal(new Set(g.nearestBeachIds).size,10,g.id);
    assert.deepEqual(g.closestBeachRoutes.map(r=>r.beachId),g.nearestBeachIds);
    assert.equal(atlas.methodology.nearestBeaches.candidateComparisons.find(c=>c.ghatId===g.id).candidates.length,atlas.beaches.length);
    for(const item of g.closestBeachRoutes) {
      const r=atlas.routes.find(r=>r.id===item.routeId);
      assert.equal(primaryGhatId(r,atlas.ghats),g.id);
      assert.equal(r.distanceM,item.distanceM);
      assert.equal(r.provenance.waypointPositions[0].placeId,atlas.origin.id);
      assert.equal(r.provenance.waypointPositions.at(-1).placeId,`arrival-${item.beachId}`);
    }
  }
});
test('nearest selection rejects duplicate arrivals and omitted lower-distance comparisons',()=>{
  const duplicated=structuredClone(atlas);
  duplicated.ghats[0].nearestBeachIds[1]=duplicated.ghats[0].nearestBeachIds[0];
  assert.ok(validateData(duplicated,sources,coverage).some(e=>e.startsWith('Missing ten unique')));
  const changed=structuredClone(atlas),g=changed.ghats[0];
  const comparison=changed.methodology.nearestBeaches.candidateComparisons.find(c=>c.ghatId===g.id);
  const omitted=comparison.candidates.find(c=>!g.nearestBeachIds.includes(c.beachId)&&!changed.routes.some(r=>r.beachId===c.beachId&&primaryGhatId(r,changed.ghats)===g.id));
  omitted.distanceM=1;
  assert.ok(validateData(changed,sources,coverage).some(e=>e.startsWith('Unresolved nearest comparison boundary')));
});
test('each beach exposes five distinct main corridors, not approach-ghat or highway duplicates',()=>{
  for(const b of atlas.beaches) {
    assert.equal(new Set(b.shortestGhatIds).size,5,b.id);
    assert.deepEqual(b.closestGhatRoutes.map(s=>s.ghatId),b.shortestGhatIds);
    for(const s of b.closestGhatRoutes) {
      const r=atlas.routes.find(r=>r.id===s.routeId);
      assert.equal(r.kind,'ghat');
      assert.equal(primaryGhatId(r,atlas.ghats),s.ghatId);
      assert.equal(r.beachId,b.id);assert.equal(r.distanceM,s.distanceM);
    }
  }
  const changed=structuredClone(atlas),b=changed.beaches[0];
  b.shortestGhatIds[1]=b.shortestGhatIds[0];
  assert.ok(validateData(changed,sources,coverage).some(e=>e.startsWith('Missing five distinct primary ghats')));
  const highway=atlas.routes.find(r=>r.kind==='highway');
  assert.ok(highway);
  assert.equal(atlas.adjacencyGraph.routeEdges.some(e=>e.routeId===highway.id),false);
  const graphChanged=structuredClone(atlas);
  const edge=graphChanged.adjacencyGraph.routeEdges[0];
  edge.ghatId=atlas.ghats.find(g=>g.id!==edge.ghatId).id;
  assert.ok(validateData(graphChanged,sources,coverage).some(e=>e.startsWith('Invalid primary-ghat adjacency edge')));
});
test('beach-side omission of a shorter unevaluated numeric corridor is rejected',()=>{
  const changed=structuredClone(atlas),b=changed.beaches[0];
  const g=changed.ghats.find(g=>!changed.routes.some(r=>r.kind==='ghat'&&r.beachId===b.id&&primaryGhatId(r,changed.ghats)===g.id));
  changed.methodology.nearestBeaches.candidateComparisons.find(c=>c.ghatId===g.id).candidates.find(c=>c.beachId===b.id).distanceM=1;
  assert.ok(validateData(changed,sources,coverage).some(e=>e.startsWith('Unresolved closest ghat boundary')));
});
test('derived itineraries retain forward-only complete-leg cache evidence and explicit main ghat',async()=>{
  const route=atlas.routes.find(r=>r.provenance.coverageExpansion?.composition);
  const manifest=JSON.parse(await readFile(new URL(`../${route.provenance.cacheFile}`,import.meta.url),'utf8'));
  assert.ok(manifest.composition.length>1);
  assert.ok(manifest.composition.every(s=>s.reversed===false));
  const record=await loadRouteRecord(route.provenance.cacheFile);
  assert.equal(record.response.routes[0].distance,route.distanceM);
  assert.equal(record.response.routes[0].duration,route.durationSeconds);
  assert.equal(record.response.routes[0].legs.length,route.waypointIds.length-1);
  assert.ok(auditResponse(record).length===route.waypointIds.length);
  const changed=structuredClone(atlas);
  delete changed.routes.find(r=>r.id===route.id).primaryGhatId;
  assert.ok(validateData(changed,sources,coverage).some(e=>e.startsWith('Missing explicit primary ghat')));
});
test('preserved original itineraries cannot be overwritten by destination expansion',()=>{
  const changed=structuredClone(atlas);
  const original=changed.methodology.nearestBeaches.retainedRoutes[0];
  changed.routes.find(r=>r.id===original.routeId).name+=' changed';
  assert.ok(validateData(changed,sources,coverage).includes(`Changed original route ${original.routeId}`));
});
test('distance-table ranking ignores unreachable cells, adds the frozen prefix, and breaks ties reproducibly',()=>{
  assert.deepEqual(nearestCandidates([300,null,100,100],['far','unreachable','z','a'],500),[
    {beachId:'a',distanceM:600},{beachId:'z',distanceM:600},{beachId:'far',distanceM:800},
  ]);
});
test('geometry-derived demand distinguishes a straight corridor from repeated steering changes',()=>{
  const straight=Array.from({length:200},(_,i)=>[73+i*0.001,18]);
  const winding=Array.from({length:200},(_,i)=>[73+i*0.001,18+(i%2)*0.001]);
  assert.ok(drivingDemand(straight,22000).rating<drivingDemand(winding,30000).rating);
  assert.equal(drivingDemand(straight,22000).significantTurns,0);
});
test('historical foot-pass exclusions and reconciled aliases cannot become independent shortcuts',()=>{
  for(const id of ['naneghat','madhe'])assert.equal(coverage.candidates.find(c=>c.id===id).status,'excluded-nonmotorable-pass');
  assert.equal(coverage.candidates.find(c=>c.id==='radtondi').canonicalGhatId,'ambenali');
});
test('removed Raghuvir crossing has no active routes, waypoints, search identities or coverage references',()=>{
  assert.doesNotMatch(JSON.stringify({
    ghats:atlas.ghats,beaches:atlas.beaches,routes:atlas.routes,places:atlas.places,
    graph:atlas.adjacencyGraph,coverage,sources
  }),/raghuv(?:ee|i)r/i);
});
test('supported corridors retain distinct original table rows after removing a crossing',()=>{
  const modified=structuredClone(atlas);
  const comparisons=modified.methodology.nearestBeaches.candidateComparisons;
  assert.ok(comparisons.some((c,i)=>c.tableSourceIndex!==i));
  comparisons[0].tableSourceIndex=comparisons[1].tableSourceIndex;
  assert.ok(validateData(modified,sources,coverage).includes('Invalid cached comparison source indices'));
});
