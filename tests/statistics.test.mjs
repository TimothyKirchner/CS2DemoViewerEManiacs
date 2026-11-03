import test from 'node:test';
import assert from 'node:assert/strict';
import {computeStatistics} from '../web/statistics.mjs';
import {assemble} from '../web/core.mjs';

const roster=()=>Array.from({length:10},(_,i)=>({id:String(i+1),team:i<5?2:3,hp:100,alive:true,x:0,y:0,z:0,weapon:'ak47',inventory:['ak47'],armor:100,money:3000}));
const event=(kind,tick,a,v,extra={})=>({event_name:kind,tick,attacker_steamid:String(a),user_steamid:String(v),attacker_team_num:a<=5?2:3,user_team_num:v<=5?2:3,...extra});
const death=(tick,a,v,extra={})=>event('player_death',tick,a,v,{weapon:'ak47',...extra});
const hurt=(tick,a,v,dmg,health,weapon='ak47')=>event('player_hurt',tick,a,v,{dmg_health:dmg,health,weapon});
function entry(events=[],patch={}){
  const ps=roster(),last=structuredClone(ps);
  for(const e of events)if(e.event_name==='player_death'){const p=last.find(p=>p.id===e.user_steamid);if(p){p.alive=false;p.hp=0;}}
  const replay={version:1,source:'test.dem',map:'de_mirage',tickRate:64,players:ps.map(p=>({id:p.id,name:`P${p.id}`})),pistols:[0],metadata:{recording:'broadcast',eventCoverage:{damage:true,deaths:true,blinds:true}},rounds:[{number:1,start:0,live:64,end:2000,winner:2,incomplete:false,frames:[{tick:64,players:ps},{tick:2000,players:last}],events,effects:[],grenades:[]}]};
  return {id:'one',replay,...patch};
}
const player=(s,id='1')=>s.players.find(p=>p.id===id);

test('damage caps overkill at remaining health, excludes teammates/world and separates utility',()=>{
 const s=computeStatistics([entry([hurt(100,1,6,35,65,'hegrenade'),hurt(110,1,6,10,55,'inferno'),hurt(120,1,6,400,0),hurt(130,1,2,50,50),hurt(140,0,7,20,80)])]);
 assert.equal(player(s).damage,100);assert.equal(player(s).adr,100);assert.equal(player(s).heDamage,35);assert.equal(player(s).fireDamage,10);assert.equal(player(s).utilityDamage,45);
 assert.equal(s.weapons.find(w=>w.weapon==='ak47').damage,55);
});
test('legacy exports and POV rounds cannot silently become zero ADR, perfect KAST or clutches',()=>{
 for(const kind of ['legacy','pov','incomplete','missing-opening']){
 const e=entry([death(100,1,6)]);if(kind==='legacy')delete e.replay.metadata;if(kind==='pov')e.replay.metadata.recording='unknown';if(kind==='incomplete')e.replay.rounds[0].incomplete=true;if(kind==='missing-opening')e.replay.rounds[0].frames.shift();
 const s=computeStatistics([e]),p=player(s);assert.equal(p.kills,1);assert.equal(p.adr,null,kind);assert.equal(p.kast,null,kind);assert.equal(p.damage,null,kind);assert.equal(p.clutchAttempts,null,kind);assert.ok(s.warnings.length);
 }
});
test('zero hurt events in an explicitly covered complete round is a real zero',()=>{
 const s=computeStatistics([entry()]);assert.equal(player(s).adr,0);assert.equal(player(s).kast,100);assert.equal(s.coverage.damageRounds,1);
});
test('trade window is configurable; each teammate traded once and a trade kill can trade multiple deaths',()=>{
 const e=entry([death(100,6,1),death(110,6,2),death(400,3,6),death(410,4,7)]);
 const s=computeStatistics([e]);assert.equal(player(s).tradedDeaths,1);assert.equal(player(s,'2').tradedDeaths,1);assert.equal(player(s,'3').tradeKills,1);assert.equal(player(s).kast,100);
 const short=computeStatistics([e],{tradeWindowSeconds:1});assert.equal(player(short).tradedDeaths,0);assert.equal(player(short).kast,0);
 assert.throws(()=>computeStatistics([e],{tradeWindowSeconds:-1}),RangeError);
});
test('opening duels exclude suicide/teamkills and assists require a teammate',()=>{
 const s=computeStatistics([entry([death(80,2,2),death(90,1,3),death(100,1,6,{assister_steamid:'4',headshot:true}),death(200,7,1,{assister_steamid:'5'})])]);
 assert.equal(player(s).kills,1);assert.equal(player(s).openingKills,1);assert.equal(player(s,'6').openingDeaths,1);assert.equal(player(s,'4').assists,1);assert.equal(player(s,'5').assists,0);assert.equal(player(s).headshots,1);
});
test('clutch attempts begin at 1vX and a round winner earns a win only once',()=>{
 const s=computeStatistics([entry([death(100,6,1),death(110,6,2),death(120,6,3),death(130,6,4),death(140,5,6),death(150,5,7),death(160,5,8),death(170,5,9),death(180,5,10)])]);
 assert.equal(player(s,'5').clutchAttempts,1);assert.equal(player(s,'5').clutchWins,1);assert.equal(s.teams.find(t=>t.id==='one:team-1').wins,1);
});
test('KAST survival uses an end snapshot when a death event is missing',()=>{
 const e=entry();e.replay.rounds[0].frames[1].players[0].hp=0;e.replay.rounds[0].frames[1].players[0].alive=false;
 assert.equal(player(computeStatistics([e])).kast,0);
});
test('flash effectiveness distinguishes enemy and teammate blind events',()=>{
 const s=computeStatistics([entry([event('player_blind',100,1,6,{blind_duration:2}),event('player_blind',120,1,2,{blind_duration:1}),event('player_blind',130,1,7,{blind_duration:0})])]);
 assert.equal(player(s).enemyFlashes,1);assert.equal(player(s).enemyBlindSeconds,2);assert.equal(player(s).teamFlashes,1);
});
test('cohort aggregation scopes unnamed teams, combines Steam IDs and keeps covered damage denominator',()=>{
 const a=entry([hurt(100,1,6,50,50)]),b=entry([death(100,1,6)],{id:'two'});delete b.replay.metadata;
 const s=computeStatistics([a,b]);assert.equal(player(s).rounds,2);assert.equal(player(s).adr,50);assert.equal(player(s).damageRounds,1);assert.equal(s.teams.length,4);assert.equal(s.maps[0].matches,2);
 a.teamNames={'team-1':'Emaniacs'};b.teamNames={'team-1':'Emaniacs'};assert.equal(computeStatistics([a,b]).teams.length,3);
 assert.equal(s.teams.find(t=>t.id==='one:team-1').economy.pistol.kast,100);
});
test('round refs and selected sides retain opponent context but restrict every aggregate subject',()=>{
 const s=computeStatistics([entry([death(100,1,6),hurt(110,7,2,20,80)])],{roundRefs:[{entryId:'one',roundIndex:0,sides:[3]}]});
 assert.equal(s.players.length,5);assert.equal(s.maps[0].kills,0);assert.equal(s.maps[0].damage,20);assert.equal(s.teams.length,1);assert.equal(s.weapons[0].kills,0);
});
test('post-round events are retained separately, capped before the next round start, and excluded from metrics',()=>{
 const ev=[{event_name:'round_freeze_end',tick:64,total_rounds_played:0},{event_name:'round_end',tick:640,winner:2},death(650,1,6),{event_name:'round_start',tick:700},{event_name:'flashbang_detonate',tick:705,x:0,y:0},{event_name:'round_freeze_end',tick:800,total_rounds_played:1},{event_name:'round_end',tick:1200,winner:2}];
 const rows=[64,800].map(tick=>({tick,steamid:'1',name:'P',X:0,Y:0,health:100,team_num:2}));
 const replay=assemble({map_name:'de_mirage'},ev,rows,[]);assert.equal(replay.rounds[0].postRoundEvents.length,1);assert.equal(replay.rounds[0].postRoundEvents[0].tick,650);assert.ok(replay.rounds[0].events.every(e=>e.tick<=640));assert.ok(replay.rounds[0].effects.every(e=>e.end>=e.start));
 assert.equal(player(computeStatistics([{id:'one',replay}])).kills,0);
});
