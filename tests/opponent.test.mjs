import test from 'node:test';
import assert from 'node:assert/strict';
import {detectOpponent,opponentRounds,normalizeOverrides,demoRosters} from '../web/opponent.mjs';
import {makeEntry,sessionBundle,readBundle} from '../web/session.mjs';

// Synthetic players only: "o*" are the target opponent, "x*" / "y*" / "z*" are other teams.
const CORE=['o1','o2','o3','o4','o5'];
const frame=(tick,t,ct)=>({tick,players:[...t.map(id=>({id,team:2,x:0,y:0,z:0,hp:100,alive:true})),...ct.map(id=>({id,team:3,x:0,y:0,z:0,hp:100,alive:true}))]});
// `half` rounds with team A on T, then `half` rounds with the sides swapped.
function replay(map,teamA,teamB,half=3){
  const rounds=[];for(let i=0;i<half*2;i++){const swap=i>=half,start=i*1000;rounds.push({number:i+1,start,live:start+10,end:start+900,winner:2,frames:[frame(start+10,swap?teamB:teamA,swap?teamA:teamB)],events:[],effects:[],grenades:[]});}
  return {version:1,source:`${map}-${teamA[0]}-${teamB[0]}.dem`,map,tickRate:64,players:[...teamA,...teamB].map(id=>({id,name:`Name ${id}`})),rounds};
}
const entry=(id,r,date='')=>makeEntry(r,{id,date});
const others=p=>[1,2,3,4,5].map(i=>`${p}${i}`);

test('side switches keep the same team key per demo',()=>{
 const r=demoRosters(replay('de_nuke',CORE,others('x')));
 assert.deepEqual(r['team-1'].sides,[2,2,2,3,3,3]);assert.deepEqual([...r['team-1'].players.keys()].sort(),CORE);
 assert.equal(r['team-1'].players.get('o1'),6);
});

test('target team is found by SteamIDs across demos, sides and maps; stand-ins are labelled',()=>{
 const withStandIn=['o1','o2','o3','o4','s1'];
 const entries=[
  entry('a',replay('de_nuke',CORE,others('x'))),
  entry('b',replay('de_mirage',others('y'),CORE)), // opponent started CT here
  entry('c',replay('de_nuke',withStandIn,others('z')),'2026-10-01'),
  entry('d',replay('de_inferno',others('w'),['o1','o2','o3','s2','s3'])),
 ];
 const d=detectOpponent(entries);
 assert.equal(d.total,4);assert.equal(d.ambiguous,false);
 assert.deepEqual([...d.core].sort(),CORE);
 assert.deepEqual(d.demos.map(x=>[x.entryId,x.teamKey,x.startSide,x.coreCount]),[['a','team-1',2,5],['b','team-2',3,5],['c','team-1',2,4],['d','team-2',3,3]]);
 const p=Object.fromEntries(d.players.map(x=>[x.id,x]));
 assert.equal(p.o1.label,'core');assert.equal(p.o1.demos,4);assert.equal(p.o1.rounds,24);
 assert.equal(p.o5.description,'core, 2 of 4 demos'); // exactly 50% is core
 assert.equal(p.s1.label,'stand-in');assert.equal(p.s1.description,'stand-in, 1 of 4 demos');
 assert.ok(!d.players.some(x=>x.id.startsWith('x')),'other teams are not in the roster');
 assert.deepEqual(d.maps.map(m=>[m.map,m.demos]),[['de_nuke',2],['de_inferno',1],['de_mirage',1]]);
 assert.deepEqual(d.demos.find(x=>x.entryId==='c').standIns,['s1']);
 const refs=opponentRounds(entries,d);assert.equal(refs.length,24);
 assert.deepEqual(refs.filter(r=>r.entryId==='b').map(r=>r.side),[3,3,3,2,2,2]);
});

test('a demo with fewer than three core players does not belong to the team',()=>{
 const entries=[entry('a',replay('de_nuke',CORE,others('x'))),entry('b',replay('de_nuke',CORE,others('y'))),entry('c',replay('de_nuke',['o1','o2','s1','s2','s3'],others('z')))];
 const d=detectOpponent(entries);
 assert.deepEqual(d.demos.map(x=>x.entryId),['a','b']);
 assert.equal(d.unmatched[0].entryId,'c');assert.match(d.unmatched[0].reason,/only 2 core/);
 assert.ok(!d.players.some(x=>x.id==='s1'),'players of unmatched demos are not listed');
});

test('overrides mark players core or stand-in and exclude demos',()=>{
 const entries=[entry('a',replay('de_nuke',CORE,others('x'))),entry('b',replay('de_nuke',['o1','o2','o3','o4','s1'],others('y'))),entry('c',replay('de_nuke',['o1','o2','o3','o4','s1'],others('z'))),entry('d',replay('de_nuke',others('q'),others('r')))];
 const auto=detectOpponent(entries);assert.equal(auto.players.find(p=>p.id==='s1').label,'core'); // 2 of 4 demos
 const d=detectOpponent(entries,{standIn:['s1'],core:['o5'],excluded:['d']});
 assert.equal(d.total,3);assert.deepEqual(d.excluded.map(x=>x.entryId),['d']);
 const p=Object.fromEntries(d.players.map(x=>[x.id,x]));
 assert.equal(p.s1.label,'stand-in');assert.equal(p.s1.override,'stand-in');assert.equal(p.o5.label,'core');assert.equal(p.o5.override,'core');
 assert.ok(d.demos.every(x=>x.coreCount>=4));
});

test('one demo is ambiguous until a player is marked core',()=>{
 const entries=[entry('a',replay('de_nuke',others('x'),CORE))];
 assert.equal(detectOpponent(entries).ambiguous,true);
 const d=detectOpponent(entries,{core:['o3']});
 assert.equal(d.ambiguous,false);assert.deepEqual([...d.core].sort(),CORE);assert.equal(d.demos[0].teamKey,'team-2');
});

test('overrides persist in the session bundle and are sanitized',()=>{
 const a=entry('a',replay('de_nuke',CORE,others('x')));
 assert.deepEqual(normalizeOverrides({core:['o1','o1',7,null,{}]}),{core:['o1','7'],standIn:[],excluded:[]});
 const bundle=JSON.parse(JSON.stringify(sessionBundle([a],[],{core:['o1'],standIn:['s1'],excluded:['a','missing']})));
 assert.deepEqual(readBundle(bundle).opponent,{core:['o1'],standIn:['s1'],excluded:['a']});
 assert.deepEqual(readBundle(JSON.parse(JSON.stringify(sessionBundle([a],[])))).opponent,{core:[],standIn:[],excluded:[]});
});
