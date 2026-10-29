import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import {reviewReplay} from '../web/review/engine/review.mjs';
import {instructiveRounds,instructivePlan,instructiveMarkdown,clipWindows,choose,findPlayer,mmss} from '../web/review/engine/instructive.mjs';
import {prepareDemo,listDemos,parseArgs,demoBase} from '../scripts/instructive-rounds.mjs';

// Synthetic match: T players 1-5 near x=0, CT players 6-10 far away. Player 1 is the focus player.
const R=64,LEN=R*60,P=(id,team,extra={})=>({id:String(id),team,x:team===2?id*100:5000+id*100,y:0,z:0,yaw:0,hp:100,alive:true,inventory:['AK-47'],weapon:'AK-47',armor:100,money:800,...extra});
const death=(tick,victim,attacker)=>({tick,event_name:'player_death',user_steamid:String(victim),user_team_num:victim<=5?2:3,attacker_steamid:String(attacker),attacker_team_num:attacker<=5?2:3,headshot:false});
function match(specs){
  const rounds=specs.map((s,i)=>{
    const start=i*(LEN+R*20),live=start+R*15,end=live+LEN,frames=[];
    for(let t=start;t<=end;t+=8)frames.push({tick:t,players:Array.from({length:10},(_,k)=>{const id=k+1;return P(id,id<=5?2:3,s.place?.(id,t)??{});})});
    const events=s.events(live).sort((a,b)=>a.tick-b.tick);
    return {number:i+1,start,live,end,eventEnd:end+R*5,winner:s.winner,reason:'',frames,events,effects:[],grenades:[]};
  });
  return {version:1,source:'synthetic.dem',map:'de_test',tickRate:R,players:Array.from({length:10},(_,k)=>({id:String(k+1),name:'P'+(k+1)})),rounds};
}
const SPECS=[
  // R1: player 1 dies first to 6 at 20s, untraded, round lost.
  {winner:3,events:l=>[death(l+R*20,1,6),death(l+R*40,2,7)]},
  // R2: player 1 opens and gets a 3k, round won.
  {winner:2,events:l=>[death(l+R*10,6,1),death(l+R*12,7,1),death(l+R*30,8,1)]},
  // R3: teammates 2-5 die, then player 1 wins a 1v2 (kills 9 and 10).
  {winner:2,events:l=>[death(l+R*5,6,2),death(l+R*6,7,3),death(l+R*7,8,4),death(l+R*20,2,9),death(l+R*21,3,9),death(l+R*22,4,10),death(l+R*23,5,10),death(l+R*35,9,1),death(l+R*45,10,1)]},
  // R4: bomb planted at 30s with player 1 alive, defused at 50s; player 1 dies at 45s.
  {winner:3,events:l=>[{tick:l+R*30,event_name:'bomb_planted'},death(l+R*45,1,8),{tick:l+R*50,event_name:'bomb_defused'}]},
  // R5: player 1 has a pistol and $4000 unspent while teammates full-buy; dies untraded.
  {winner:3,place:id=>id===1?{inventory:['Glock-18'],armor:0,money:4000}:{},events:l=>[death(l+R*25,6,2),death(l+R*40,1,7)]}
];

test('detects opening deaths, multi-kills, clutches, post-plants and buys for the focus player',()=>{
  const replay=match(SPECS),review=reviewReplay(replay,{detail:null});
  const res=instructiveRounds(replay,review,{player:'1'});
  const by=n=>res.picks.find(p=>p.roundNumber===n),types=n=>by(n).categories.map(c=>c.type);
  assert.equal(res.format,'strat-scope-instructive-rounds');
  assert.equal(by(1).category,'opening-death-lost');assert.equal(by(1).kind,'mistake');assert.equal(by(1).confidence,'high');
  assert.ok(types(1).includes('untraded-death'));
  assert.ok(types(2).includes('multikill')&&types(2).includes('opening-kill'));assert.equal(by(2).kind,'highlight');
  assert.equal(by(3).category,'clutch-won');assert.match(by(3).why,/1v2/);
  assert.ok(types(4).includes('afterplant-lost'),'alive at the plant, died before the defuse');
  assert.ok(types(5).includes('under-buy'));
  assert.equal(by(5).categories.find(c=>c.type==='under-buy').confidence,'low');
  for(const p of res.picks){
    assert.equal(p.spectate.steamId,'1');
    assert.ok(p.windows.length>=1&&p.windows.every(w=>w.startTick<w.endTick&&w.moments.length));
    assert.equal(p.keyClock,mmss(p.keyTick/R));
  }
  assert.deepEqual(res.picks.map(p=>p.rank),res.picks.map((_,i)=>i+1));
});

test('post-plant category follows the round outcome',()=>{
  const replay=match([{winner:3,events:l=>[{tick:l+R*30,event_name:'bomb_planted'},{tick:l+R*50,event_name:'bomb_defused'}]},{winner:2,events:l=>[{tick:l+R*30,event_name:'bomb_planted'},death(l+R*35,6,1),{tick:l+R*55,event_name:'bomb_exploded'}]}]);
  const res=instructiveRounds(replay,reviewReplay(replay,{detail:null}),{player:'1',minScore:0});
  assert.equal(res.picks.find(p=>p.roundNumber===1).category,'afterplant-lost');
  assert.ok(res.picks.find(p=>p.roundNumber===2).categories.some(c=>c.type==='afterplant-won'));
  const ct=instructiveRounds(replay,reviewReplay(replay,{detail:null}),{player:'6',minScore:0});
  assert.ok(ct.picks.find(p=>p.roundNumber===1).categories.some(c=>c.type==='retake-won'));
});

test('clip windows use lead/tail, clamp to the round and merge overlaps',()=>{
  const round={start:1000,live:2000,end:6000,eventEnd:6200};
  const w=clipWindows([{tick:2100},{tick:2500},{tick:5000},{tick:5500}].map(m=>({...m,label:'x'})),round,64,{leadSeconds:6,tailSeconds:3});
  assert.equal(w.length,2);
  assert.equal(w[0].startTick,1716);assert.equal(w[0].endTick,2692);assert.equal(w[0].moments.length,2);
  assert.equal(w[1].startTick,4616);assert.equal(w[1].endTick,5692);
  assert.equal(clipWindows([{tick:6150,label:'x'}],round,64)[0].endTick,6200,'clamped to eventEnd');
  assert.equal(clipWindows([{tick:1100,label:'x'}],round,64)[0].startTick,1000,'clamped to round start');
  assert.equal(w[0].startClock,mmss(1716/64));assert.equal(mmss(75.9),'1:15');
});

test('ranking caps the list and keeps both mistakes and good examples',()=>{
  const c=(n,kind,score)=>({roundNumber:n,kind,score});
  const list=[...Array.from({length:10},(_,i)=>c(i+1,'mistake',10-i*0.1)),c(20,'highlight',1.6),c(21,'highlight',1.5),c(22,'highlight',1.4)];
  const picked=choose(list,{max:6,minEach:2});
  assert.equal(picked.length,6);
  assert.equal(picked.filter(p=>p.kind==='highlight').length,2);
  assert.ok(picked[0].score>=picked.at(-1).score,'sorted by score');
  const replay=match(SPECS);
  assert.ok(instructiveRounds(replay,reviewReplay(replay,{detail:null}),{player:'1',max:3}).picks.length<=3);
});

test('plan is a recorder-compatible recording plan and the report lists every pick',()=>{
  const replay=match(SPECS),res=instructiveRounds(replay,reviewReplay(replay,{detail:null}),{player:'1'});
  const plan=instructivePlan(replay,res,{demoFile:'C:/cache/synthetic.dem'});
  assert.equal(plan.format,'strat-scope-recording-plan');assert.equal(plan.demoFile,'C:/cache/synthetic.dem');
  assert.equal(plan.clips.length,res.picks.reduce((n,p)=>n+p.windows.length,0));
  for(const c of plan.clips){assert.ok(c.startTick<c.endTick);assert.equal(c.steamId,'1');assert.equal(c.player,'P1');assert.match(c.subtitles,/Round \d+/);assert.ok(c.notes.length);}
  const md=instructiveMarkdown(res,{demo:'synthetic.dem',plan:'synthetic.plan.json'});
  for(const p of res.picks)assert.ok(md.includes(`| ${p.rank} | ${p.roundNumber} (`));
  assert.match(md,/record-clips\.mjs --plan "synthetic\.plan\.json" --demo "synthetic\.dem"/);
  assert.equal(findPlayer(replay,'p1').id,'1');assert.equal(findPlayer(replay,'7').id,'7');assert.equal(findPlayer(replay,'nobody'),null);
  assert.throws(()=>instructiveRounds(replay,null,{player:'99'}),/not in this demo/);
});

test('compressed demos unpack to a cache outside the repository',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ss-instructive-')),cache=path.join(dir,'cache');
  const gz=path.join(dir,'match.dem.gz');fs.writeFileSync(gz,zlib.gzipSync(Buffer.from('HL2DEMO-test')));
  fs.writeFileSync(path.join(dir,'notes.txt'),'x');
  const out=prepareDemo(gz,cache);
  assert.ok(out.startsWith(cache)&&out.endsWith('.dem'));assert.equal(fs.readFileSync(out,'utf8'),'HL2DEMO-test');
  assert.equal(prepareDemo(gz,cache),out,'cached');
  if(typeof zlib.zstdCompressSync==='function'){const zst=path.join(dir,'b.dem.zst');fs.writeFileSync(zst,zlib.zstdCompressSync(Buffer.from('zstd-demo')));assert.equal(fs.readFileSync(prepareDemo(zst,cache),'utf8'),'zstd-demo');}
  assert.throws(()=>prepareDemo(gz,path.resolve('review-out','cache')),/inside the repository/);
  assert.deepEqual(listDemos([dir]).map(f=>path.basename(f)),['match.dem.gz'].concat(typeof zlib.zstdCompressSync==='function'?['b.dem.zst']:[]).sort());
  assert.equal(demoBase('x/1-abc.dem.zst'),'1-abc');
  assert.deepEqual(parseArgs(['a.dem','--player','PlayerOne','--max','5']).inputs,['a.dem']);
  assert.throws(()=>parseArgs([]),/Pass one or more demos/);
  fs.rmSync(dir,{recursive:true,force:true});
});

test('round winners given as "T"/"CT" (CS2 demos) map to team numbers', async () => {
  const {winnerTeam} = await import('../web/review/engine/util.mjs');
  assert.deepEqual(['T', 'CT', 2, 3, '2', '3', null, 'x'].map(winnerTeam), [2, 3, 2, 3, 2, 3, null, null]);
});
