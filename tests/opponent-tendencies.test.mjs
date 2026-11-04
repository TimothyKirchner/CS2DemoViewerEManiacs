import test from 'node:test';
import assert from 'node:assert/strict';
import {duelTendencies,stackTendencies,utilityClusters,economyHabits,playerTendencies,timeoutTendencies,tendencyAnalysis} from '../web/opponent-tendencies.mjs';
import {detectOpponent,opponentRounds} from '../web/opponent.mjs';
import {buyLibrary} from '../web/opponent-buys.mjs';
import {makeEntry} from '../web/session.mjs';

// Synthetic players only: "o*" are the target opponent (always CT here unless `side` says T), "s1" a stand-in,
// "x*" the other team. World: site A at x=2000, B at x=-2000, mid at 0.
const MAP={x:0,y:0,scale:1,sites:{A:[2000,0],B:[-2000,0]}},mapDefs={de_test:MAP};
const SPOT={A:{x:2000,place:'BombsiteA'},mid:{x:0,place:'Middle'},B:{x:-2000,place:'BombsiteB'},long:{x:1200,place:'LongA'}};
const GEAR={full:{inventory:['AK-47','Glock-18'],armor:100,hasHelmet:true,money:1500},eco:{inventory:['Glock-18'],armor:0,money:3000},force:{inventory:['Galil AR','Glock-18'],armor:100,money:200}};
const at=(id,team,spot,gear)=>({id,team,x:SPOT[spot].x,y:0,z:0,hp:100,alive:true,weapon:'knife',place:SPOT[spot].place,...GEAR[gear]});
const DEFAULT={o1:'A',o2:'A',o3:'mid',o4:'B',o5:'B'};
const death=(tick,victim,vt,attacker,at_)=>({event_name:'player_death',tick,user_steamid:victim,user_team_num:vt,attacker_steamid:attacker,attacker_team_num:at_,weapon:'ak47'});
// One round: samples at 0, 15 and 20 s; `kills` = [[seconds, victim, attacker], ...] with sides from the ids.
function round(i,{side=3,layout=DEFAULT,winner=side,kills=[],effects=[],plant=null,gear='full',enemyGear='full',freeze=15,e='x'}={}){
  const start=i*20000,live=start+freeze*64,end=live+64*80,enemy=side===2?3:2,sideOf=id=>/^[os]/.test(id)?side:enemy;
  const sample=t=>({tick:live+t*64,players:[...Object.entries(layout).map(([id,s])=>at(id,side,s,gear)),...[1,2,3,4,5].map(k=>at(e+k,enemy,'mid',enemyGear))]});
  const events=kills.map(([t,v,a])=>death(live+t*64,v,sideOf(v),a,sideOf(a)));
  if(plant)events.push({event_name:'bomb_planted',tick:live+plant.t*64,user_steamid:plant.by,user_team_num:enemy,user_X:SPOT[plant.site].x,user_Y:0});
  return {number:i+1,start,live,end,winner,events,grenades:[],frames:[sample(0),sample(15),sample(20)],
    effects:effects.map(([type,t,x,y,thrower])=>({type,start:live+t*64,end:live+t*64+64*5,x,y,z:0,id:`${i}-${t}`,thrower,team:sideOf(thrower)}))};
}
const replay=(rounds,pistols=[])=>({version:1,source:'de_test.dem',map:'de_test',tickRate:64,rounds,pistols,metadata:{recording:'broadcast',eventCoverage:{deaths:true,damage:true,blinds:true}},
  players:[...new Set(rounds.flatMap(r=>r.frames[0].players.map(p=>p.id)))].map(id=>({id,name:`Name ${id}`}))});
const smoke=(t,x,by='o1')=>['smoke',t,x,0,by];
function setup(){
  const a=makeEntry(replay([
    // R1 pistol lost; o1 wins the opening at A but dies, traded by o2 2 s later.
    round(0,{winner:2,kills:[[10,'x1','o1'],[12,'o1','x2'],[14,'x2','o2']],effects:[smoke(3,1000),smoke(4,1050,'o2')]}),
    // R2 force after the lost pistol; o3 loses the opening on A (not traded); A stack (3 CTs).
    round(1,{gear:'force',layout:{o1:'A',o2:'A',o3:'A',o4:'B',o5:'B'},kills:[[8,'o3','x1']],effects:[smoke(5,980),['fire',30,-2000,0,'o4']]}),
    // R3 retake: Ts plant B while every CT is on A, CTs win.
    round(2,{layout:{o1:'A',o2:'A',o3:'A',o4:'A',o5:'mid'},plant:{t:40,by:'x1',site:'B'},kills:[[50,'x1','o4']]}),
    // R4 a long freeze time after two lost rounds is a timeout.
    round(3,{winner:2,freeze:50}),round(4,{winner:2}),round(5,{freeze:50}),
  ],[0]),{id:'a'});
  // Demo b: o5 absent; the stand-in s1 takes an opening.
  const b=makeEntry(replay([round(0,{layout:{o1:'A',o2:'A',o3:'mid',o4:'B',s1:'B'},winner:2,e:'y',kills:[[9,'y3','s1']]}),round(1,{gear:'eco',layout:{o1:'A',o2:'A',o3:'mid',o4:'B',s1:'B'},winner:2,e:'y'})],[0]),{id:'b'});
  const c=makeEntry(replay([round(0,{e:'z'})]),{id:'c'});
  const entries=[a,b,c],d=detectOpponent(entries),refs=opponentRounds(entries,d);
  return {entries,d,refs,lib:buyLibrary(entries,refs,{mapDefs})};
}

test('opening duels by place and core player; trades within 5 s',()=>{
  const {entries,d,refs}=setup(),t=duelTendencies(entries,d,refs,{mapDefs});
  assert.equal(t.openings.count,4);assert.equal(t.openings.wins,3);assert.equal(t.openings.sample,'4 of 9 rounds');assert.equal(t.openings.standIn,1);
  const a=t.places.find(p=>p.place==='BombsiteA');assert.equal(a.count,3);assert.equal(a.wins,2);assert.equal(a.sample,'3 of 4 openings');
  const b=t.places.find(p=>p.place==='BombsiteB');assert.equal(b.wins,1);assert.equal(b.zone,'B');
  assert.ok(t.players.every(p=>d.core.includes(p.id)),'per-player rows are core only');assert.equal(t.players.some(p=>p.id==='s1'),false);
  assert.equal(t.trades.deaths,2);assert.equal(t.trades.sample,'1 of 2 deaths');assert.equal(t.trades.traded,1);assert.equal(t.trades.pairs[0].label,'Name o2 for Name o1');assert.equal(t.trades.medianSeconds,2);
  assert.equal(t.trades.openingDeaths,1);assert.equal(t.trades.openingTraded,0);
});

test('stacks and retakes',()=>{
  const {entries,d,refs}=setup(),s=stackTendencies(entries,d,refs,{mapDefs});
  assert.equal(s.stacks.A,2,'R2 and R3 have >= 3 CTs on A');assert.equal(s.stacks.B,0);assert.equal(s.stacks.sample,'2 of 9 rounds');
  assert.equal(s.plants.count,1);assert.equal(s.plants.retakes,1);assert.equal(s.plants.retakeWins,1);
});

test('utility landing clusters with timing and throwers',()=>{
  const {entries,d,refs}=setup(),u=utilityClusters(entries,d,refs);
  const sm=u.types.smoke;assert.equal(sm.thrown,3);assert.equal(sm.clusters.length,1);
  const c=sm.clusters[0];assert.equal(c.count,3);assert.equal(c.rounds,2);assert.equal(c.sample,'2 of 9 rounds');assert.equal(c.medianSeconds,4);
  assert.deepEqual(c.throwers.map(t=>t.label),['Name o1','Name o2']);
  assert.equal(u.types.fire.clusters.length,0,'a single molly is not a cluster');assert.equal(u.types.fire.thrown,1);
});

test('economy: force after a lost pistol, eco after a lost pistol, saves',()=>{
  const {lib}=setup(),e=economyHabits(lib.rounds),lost=e.rows.find(r=>r.id==='lost-pistol-ct');
  assert.equal(lost.count,2);assert.equal(lost.force,1);assert.equal(lost.eco,1);assert.equal(lost.forceShare,.5);
  assert.equal(e.rows.find(r=>r.id==='lost-pistol-t').count,0);
  assert.ok(e.saves.lost>=1);assert.equal(e.saves.saved,e.saves.lost,'synthetic rounds end with players alive');
});

test('clutch and per-player rows come from computeStatistics, core players only',()=>{
  const {entries,d,refs}=setup(),p=playerTendencies(entries,d,refs);
  assert.ok(p.players.length>0);assert.ok(p.players.every(x=>d.core.includes(x.id)));
  const o1=p.players.find(x=>x.id==='o1');assert.equal(o1.openingKills,1);const o2=p.players.find(x=>x.id==='o2');assert.equal(o2.tradeKills,1);
  assert.equal(p.players.find(x=>x.id==='o3').openingDeaths,1);
});

test('timeouts: long freeze times after losing streaks',()=>{
  const {entries,d}=setup(),t=timeoutTendencies(entries,d);
  assert.equal(t.count,2);assert.equal(t.list[0].number,4);assert.equal(t.list[0].likely,'other team','the other team lost R2 and R3');
  assert.equal(t.list[1].number,6);assert.equal(t.list[1].ownStreak,2);assert.equal(t.list[1].likely,'target team');assert.equal(t.likelyOwn,1);
  assert.equal(t.list[1].won,true);
});

test('full analysis groups by map and side and lists heuristics',()=>{
  const {entries,d,refs,lib}=setup(),a=tendencyAnalysis(entries,d,refs,{mapDefs,buyRounds:lib.rounds});
  assert.equal(a.maps.length,1);assert.equal(a.maps[0].ct.rounds,9);assert.equal(a.maps[0].t.rounds,0);
  assert.ok(a.warnings.some(w=>w.includes('core players only')));assert.ok(a.warnings.some(w=>w.startsWith('Heuristic: timeout')));
});
