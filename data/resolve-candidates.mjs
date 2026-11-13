import { writeFile } from 'node:fs/promises';
import { routed, auditResponse, haversine } from '../tools/prepare-routes.mjs';
const origin=[73.854499,18.519479];
const candidates=[
  {id:'raghuvir',coordinates:[origin,[73.658,17.924],[73.619,17.716],[73.606744,17.707992],[73.585,17.711],[73.568,17.714],[73.119329,17.770963]],entry:2,exit:5},
  {id:'pargad',coordinates:[origin,[74.180,15.940],[74.111,15.891],[74.074,15.855],[74.049,15.824],[74.021,15.816],[73.756392,15.543895]],entry:3,exit:5},
  {id:'anashi',coordinates:[origin,[74.508,15.640],[74.479,15.162],[74.385,15.004],[74.361,14.9997],[74.329,14.987],[74.024,15.009]],entry:3,exit:5},
  {id:'trimbak-jawhar',coordinates:[origin,[73.530,19.932],[73.439,19.958],[73.395,19.947],[73.347,19.929],[73.227,19.913],[72.872,18.641]],entry:2,exit:4},
  {id:'madhe',coordinates:[origin,[73.580,18.204],[73.5744,18.1975],[73.562,18.191],[73.021801,17.992496]],entry:1,exit:3},
  {id:'naneghat',coordinates:[origin,[73.683,19.294],[73.6755,19.292],[73.656,19.298],[72.872,18.641]],entry:1,exit:3},
  {id:'mangeli',coordinates:[origin,[74.285,15.681],[74.150,15.700],[74.130,15.694],[74.10228,15.69019],[73.756392,15.543895]],entry:2,exit:4},
];
const records=[];
for(const candidate of candidates) {
  const record=await routed(`audit-${candidate.id}`,candidate.coordinates),route=record.response.routes?.[0];
  if(!route){records.push({id:candidate.id,code:record.response.code,cacheFile:record.cacheName});continue;}
  const before=route.legs.slice(0,candidate.entry).reduce((s,l)=>s+l.distance,0);
  const section=route.legs.slice(candidate.entry,candidate.exit).reduce((s,l)=>s+l.distance,0);
  const anchors=record.response.waypoints.slice(candidate.entry,candidate.exit+1).map(w=>({coordinates:w.location,snapDistanceM:w.distance,name:w.name}));
  const straight=haversine(anchors[0].coordinates,anchors.at(-1).coordinates);
  let audit;
  try {auditResponse(record);audit='geometry checks passed';}catch(error){audit=error.message;}
  const result={id:candidate.id,cacheFile:record.cacheName,requestUrl:record.requestUrl,retrievedAt:record.retrievedAt,distanceKm:route.distance/1000,distanceBeforeEntryKm:before/1000,sectionKm:section/1000,sectionDirectKm:straight/1000,anchors,audit,sectionRoads:route.legs.slice(candidate.entry,candidate.exit).flatMap(l=>l.steps.filter(s=>s.distance>200).map(s=>({name:s.name,ref:s.ref,distanceM:s.distance})))};
  records.push(result);console.log(JSON.stringify(result));
}
await writeFile('data/candidate-road-audit.json',JSON.stringify(records,null,2)+'\n');
