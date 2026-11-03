import test from 'node:test';
import assert from 'node:assert/strict';
import {scoutingRows,aggregateHeatmap,queryArea,clusterPatterns,roleProfiles,mapResults,simulateVeto,prepReport} from '../web/scouting.mjs';
const roster=(flip=false,x=0)=>Array.from({length:10},(_,i)=>({id:String(i),team:(i<5)!==flip?2:3,x:x+(i%5)*10,y:0,z:i<5?200:0,hp:100,alive:true,weapon:i===0?'awp':'ak47',inventory:[]}));
const round=(number=1,flip=false,x=0)=>({number,start:0,live:0,end:320,winner:2,frames:Array.from({length:641},(_,i)=>({tick:i*.5,players:roster(flip,x)})),effects:[{type:'smoke',team:2,start:50,x,y:0,z:200}],events:[]});
const entry=(id='a',map='de_nuke',name='Alpha',rounds=[round()])=>({id,teamNames:{'team-1':name,'team-2':'Beta'},replay:{source:`${id}.dem`,map,tickRate:10,players:[],rounds}});
test('cross-match teams merge only by explicit names and identity follows halftime',()=>{
 const a=entry('a','de_nuke','Alpha',[round(),round(13,true)]),b=entry('b'),unknown=entry('c','de_nuke','');
 const rows=scoutingRows([a,b,unknown],{team:'alpha'});
 assert.equal(rows.length,3);assert.equal(rows[1].side,3);
 assert.equal(scoutingRows([a,b],{roundRefs:[{entryId:'a',roundIndex:1}]}).length,2);
 assert.deepEqual(scoutingRows([a],{roundRefs:[{entryId:'a',roundIndex:1,sides:[3]}]}).map(r=>r.side),[3]);
 assert.notEqual(scoutingRows([unknown])[0].team.id,scoutingRows([entry('d','de_nuke','')])[0].team.id);
});
test('early deaths remain in role observations and missing 10-second positions have their own denominator',()=>{
 const e=entry('deaths','de_nuke','Alpha',Array.from({length:6},(_,i)=>round(i+1)));
 for(const r of e.replay.rounds){r.events=[{event_name:'player_death',tick:5,user_steamid:'1',attacker_steamid:'6'}];for(const f of r.frames)if(f.tick>=5)f.players.find(p=>p.id==='1').alive=false;}
 const p=roleProfiles(scoutingRows([e],{team:'alpha'})).find(p=>p.id==='1');assert.equal(p.observations,6);assert.equal(p.positionObservations,0);assert.equal(p.openingContacts,6);assert.equal(p.hint,'Frequent opening contact');
});
test('heatmap integrates both matches and area evidence excludes opposite floor and time',()=>{
 const rows=scoutingRows([entry(),entry('b')],{team:'alpha'}),options={startSeconds:0,endSeconds:20,floor:'upper',mapDef:{lower:'x',splitZ:100}};
 const heat=aggregateHeatmap(rows,options);assert.equal(heat.rounds,2);assert.ok(Math.abs(heat.playerSeconds-200)<1e-8);
 const hits=queryArea(rows,{x1:-1,y1:-1,x2:45,y2:1},options);assert.equal(hits.length,2);assert.equal(hits[0].players,5);assert.ok(Math.abs(hits[0].playerSeconds-100)<1e-8);
 assert.equal(queryArea(rows,{x1:-1,y1:-1,x2:45,y2:1},{...options,floor:'lower'}).length,0);
 assert.throws(()=>aggregateHeatmap(scoutingRows([entry(),entry('z','de_mirage')]),options),/one map/);
});
test('recurring signatures separate map/team/side and preserve route chronology',()=>{
 const rows=scoutingRows([entry(),entry('b'),entry('c','de_mirage')],{team:'alpha'}),groups=clusterPatterns(rows);
 assert.equal(groups.filter(g=>g.kind==='opening').length,1);assert.equal(groups.find(g=>g.kind==='utility').count,2);
 const reverse=entry('reverse');reverse.replay.rounds[0].frames.forEach(f=>f.players.forEach(p=>p.x=f.tick<150?2000:0));
 const paths=clusterPatterns([...rows,...scoutingRows([reverse],{team:'alpha'})]).filter(g=>g.kind==='path');assert.equal(paths.length,1);assert.equal(paths[0].count,2);
});
test('role hints require observations and results do not fabricate unknown winners',()=>{
 const small=roleProfiles(scoutingRows([entry()],{team:'alpha'}));assert.ok(small.every(p=>p.confidence==='insufficient'));assert.equal(small[0].hint,'Insufficient observations');
 const e=entry('many','de_nuke','Alpha',Array.from({length:6},(_,i)=>round(i+1)));e.replay.rounds[0].winner=null;
 const rows=scoutingRows([e],{team:'alpha'}),profiles=roleProfiles(rows);assert.equal(profiles.find(p=>p.id==='0').hint,'Frequent AWP equipment');
 const result=mapResults(rows)[0];assert.equal(result.decided,5);assert.equal(result.wins,5);assert.equal(result.unknown,1);assert.equal(result.matches,1);
});
test('manual veto rejects reused maps, records order and has no predictive output',()=>{
 const pool=['nuke','mirage','inferno'],steps=[{team:'A',action:'ban',map:'nuke'},{team:'B',action:'pick',map:'mirage'}],result=simulateVeto(pool,steps);
 assert.deepEqual(result.picks,['mirage']);assert.equal(result.decider,'inferno');assert.equal(pool.length,3);assert.throws(()=>simulateVeto(pool,[...steps,steps[0]]),/unavailable/);
});
test('prep export escapes executable HTML and preserves actionable session evidence',()=>{
 const rows=scoutingRows([entry()],{team:'alpha'}),input={title:'<script>bad()</script>',notes:'<img src=x onerror=bad()>',rows};
 const html=prepReport(input,'html');assert.ok(!html.includes('<script>'));assert.ok(html.includes('&lt;img'));assert.ok(html.includes('session match a'));assert.ok(html.includes('roundIndex 0, tick 0'));
 assert.ok(prepReport(input).includes('coarse heuristics'));
});
