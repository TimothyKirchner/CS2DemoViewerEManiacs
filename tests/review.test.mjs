import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import {tWinProbability,roundTimeline} from '../web/review/engine/win-probability.mjs';
import {aimError,equipmentValue,strafeThreshold,weaponClass} from '../web/review/engine/util.mjs';
import {buildDuels,duelMechanics} from '../web/review/engine/mechanics.mjs';
import {boxScore} from '../web/review/engine/rating.mjs';
import {reviewReplay} from '../web/review/engine/review.mjs';
import {fineTicks} from '../web/review/parse-review.mjs';

const P=(id,team,extra={})=>({id:String(id),team,x:0,y:0,z:0,yaw:0,hp:100,alive:true,inventory:['AK-47'],weapon:'AK-47',armor:100,...extra});
// T players 1-5 at x=0..., CT players 6-10 far away unless overridden.
function replayWith({events=[],place=()=>({}),end=64*60}={}){
  const frames=[];
  for(let t=0;t<=end;t+=4)frames.push({tick:t,players:Array.from({length:10},(_,i)=>{const id=i+1,team=id<=5?2:3;return P(id,team,{x:team===2?id*100:5000+id*100,y:0,...place(id,t)});})});
  const rounds=[{number:1,start:0,live:0,end,winner:3,reason:'#SFUI_Notice_CTs_Win',frames,events,effects:[],grenades:[]}];
  return {version:1,source:'t.dem',map:'de_test',tickRate:64,players:Array.from({length:10},(_,i)=>({id:String(i+1),name:'P'+(i+1)})),rounds};
}
const death=(tick,victim,attacker,extra={})=>({tick,event_name:'player_death',user_steamid:String(victim),user_team_num:victim<=5?2:3,attacker_steamid:String(attacker),attacker_team_num:attacker<=5?2:3,headshot:false,...extra});

test('win probability responds to numbers, plant and clock',()=>{
  const base={tAlive:5,ctAlive:5,planted:false,secondsLeft:100};
  assert.ok(Math.abs(tWinProbability(base)-0.5)<1e-9);
  assert.ok(tWinProbability({...base,ctAlive:4})>0.65);
  assert.ok(tWinProbability({...base,tAlive:2,ctAlive:1})>tWinProbability({...base,tAlive:2,ctAlive:2}));
  assert.equal(tWinProbability({...base,tAlive:0}),0);
  assert.equal(tWinProbability({...base,ctAlive:0}),1);
  assert.ok(tWinProbability({...base,secondsLeft:10})<0.3);
  assert.ok(tWinProbability({...base,planted:true,bombSecondsLeft:30})>0.5);
  assert.equal(tWinProbability({...base,planted:true,bombSecondsLeft:4,ctKit:true}),1);
  assert.ok(tWinProbability({...base,tAlive:0,planted:true,bombSecondsLeft:30})<0.1);
});

test('round timeline values each death and ends at the result',()=>{
  const r=replayWith({events:[death(640,1,6)]});
  const tl=roundTimeline(r.rounds[0],64);
  assert.equal(tl.points.length,1);
  assert.ok(tl.points[0].after<tl.points[0].before,'T death lowers T win chance');
  assert.equal(tl.end,0);
});

test('aim error measures 3D angle to head and yaw-only fallback',()=>{
  const me={x:0,y:0,z:0,yaw:0,pitch:0},them={x:1000,y:0,z:0};
  assert.ok(aimError(me,them).total<0.01);
  assert.ok(Math.abs(aimError({...me,yaw:90},them).total-90)<0.01);
  assert.ok(Math.abs(aimError({...me,pitch:10},them).total-10)<0.01,'pitch down 10° misses by 10°');
  assert.equal(aimError({...me,pitch:null,yaw:30},them).pitch,null);
  assert.equal(weaponClass('AK-47'),'rifle');assert.equal(weaponClass('weapon_awp'),'sniper');assert.equal(weaponClass('knife_t'),'other');
  assert.equal(strafeThreshold('MP9'),null);
  assert.equal(equipmentValue({inventory:['AK-47','Flashbang'],armor:100,hasHelmet:true}),3900);
});

test('duel mechanics use spot onset, crosshair, reaction and shot speed',()=>{
  const r=replayWith({events:[death(1000,6,1)]});
  // Dense frames: CT 6 visible to T 1 from tick 960; T 1 aims 10° off at spot.
  const fine=[];for(let t=900;t<=1000;t+=2)fine.push({tick:t,players:[{id:'1',team:2,x:0,y:0,z:0,yaw:t<980?10:0,pitch:0,vx:t<975?200:20,vy:0,alive:true,hp:100,seenBy:[]},{id:'6',team:3,x:1000,y:0,z:0,yaw:180,pitch:0,vx:0,vy:0,alive:true,hp:t<1000?100:0,seenBy:t>=960?['1']:[]}]});
  const detail={hurts:[{round:0,tick:990,victim:'6',attacker:'1',weapon:'ak47',dmg:100,armor:0,hitgroup:'head',hp:0,sameTeam:false}],shots:[{round:0,tick:976,id:'1',weapon:'weapon_ak47',x:0,y:0,z:0,yaw:0,pitch:0,speed:20},{round:0,tick:990,id:'1',weapon:'weapon_ak47',x:0,y:0,z:0,yaw:0,pitch:0,speed:150}],fine:[fine],coverage:{spotted:true,pitch:true}};
  const duels=buildDuels(r,detail);
  assert.equal(duels.length,1);assert.equal(duels[0].winner,'1');
  const [a]=duelMechanics(r,detail,duels[0]).filter(s=>s.player==='1');
  assert.equal(a.spotTick,960);
  assert.ok(Math.abs(a.crosshair-10)<0.5);
  assert.equal(a.reactionMs,250);
  assert.equal(a.timeToDamageMs,469);
  assert.equal(a.strafeShots,2);assert.equal(a.strafedShots,1);
});

test('box score: HLTV 1.0 formula, KAST with trades and capped damage',()=>{
  const r=replayWith({events:[death(640,1,6),death(700,6,2),death(900,7,2)]});
  const detail={hurts:[{round:0,tick:700,victim:'6',attacker:'2',weapon:'ak47',dmg:150,hitgroup:'head',hp:0,sameTeam:false},{round:0,tick:890,victim:'7',attacker:'2',weapon:'ak47',dmg:40,hitgroup:'chest',hp:60,sameTeam:false},{round:0,tick:900,victim:'7',attacker:'2',weapon:'ak47',dmg:100,hitgroup:'head',hp:0,sameTeam:false}]};
  const s=boxScore(r,detail);
  const p2=s.get('2');assert.equal(p2.kills,2);assert.equal(p2.damage,200,'each victim caps at 100');assert.equal(p2.tradeKills,1);
  assert.equal(s.get('1').kastRounds,1,'traded death counts for KAST');
  assert.ok(Math.abs(p2.rating1-((2/0.679)+0.7*(1/0.317)+4/1.277)/2.7)<1e-9);
  assert.equal(p2.multi[2],1);
});

test('decisions flag isolated untraded deaths, missed trades, team flashes and unused utility',()=>{
  const place=(id,t)=>id===1?{x:-3000,inventory:['AK-47','Flashbang','Smoke Grenade']}:id===2?{x:-2500}:{};
  const events=[death(64*30,1,6),{tick:64*20,event_name:'player_blind',user_steamid:'3',user_team_num:2,attacker_steamid:'4',attacker_team_num:2,blind_duration:2.5}];
  const review=reviewReplay(replayWith({events,place}),{detail:null});
  const types=review.findings.map(f=>f.player+':'+f.type);
  assert.ok(types.includes('1:isolated')===false,'teammate 2 is within 500 units, not isolated');
  assert.ok(types.includes('2:no-trade'));
  assert.ok(types.includes('4:team-flash'));
  assert.ok(types.includes('1:unused-utility'));
  assert.ok(types.includes('1:dry-opening'));
  const alone=reviewReplay(replayWith({events:[death(64*30,1,6)],place:id=>id===1?{x:-6000}:{}}),{detail:null});
  assert.ok(alone.findings.some(f=>f.player==='1'&&f.type==='isolated'&&f.severity===3));
  assert.ok(alone.clips.some(c=>c.player==='1'&&c.notes.length));
});

test('fine ticks cover fights within live rounds only',()=>{
  const r=replayWith({events:[death(1000,6,1)]});
  const ticks=fineTicks(r,[{round:0,tick:500}]);
  assert.equal(ticks[0],308);assert.ok(ticks.includes(1016));assert.ok(!ticks.includes(1018));
  assert.ok(ticks.every(t=>t%2===0));
});

test('coarse public sample review is complete and finite',()=>{
  const replay=JSON.parse(zlib.gunzipSync(fs.readFileSync(new URL('../web/sample.strats',import.meta.url))));
  const review=reviewReplay(replay);
  assert.equal(review.players.length,10);
  assert.equal(review.coverage.damage,false);
  assert.ok(review.clips.length>=10);
  for(const p of review.players){assert.ok(Number.isFinite(p.ratings.scope));assert.ok(Number.isFinite(p.ratings.hltv1));assert.equal(p.ratings.hltv2,null);assert.equal(p.mechanics.crosshair,null);}
  for(const c of review.clips){assert.ok(c.start<c.end);assert.ok(c.notes.every(n=>n.title&&n.detail));}
  for(const r of review.rounds)assert.ok(r.winProbability.every(p=>p.t>=0&&p.t<=1));
});
