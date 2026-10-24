import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyTeam,buildHeatmap,analyzeReplay} from '../web/analysis.mjs';
test('Nuke stack floors stay separate and unsupported anchors/floors emit warnings',()=>{
  const make=z=>round(Array.from({length:5},(_,i)=>player(i,3,{x:0,z})),{end:2560,frames:Array.from({length:641},(_,i)=>({tick:i*4,players:Array.from({length:5},(_,j)=>player(j,3,{x:0,z}))}))});
  const map={x:0,y:0,scale:1,sites:{A:[0,0],B:[0,0]},lower:'lower.png',splitZ:100};
  const result=z=>analyzeReplay({map:'de_nuke',tickRate:64,rounds:[make(z)]},{map});
  assert.deepEqual(result(0).rounds[0].specials.map(s=>s.site),['B']);
  assert.deepEqual(result(200).rounds[0].specials.map(s=>s.site),['A']);
  assert.ok(analyzeReplay({tickRate:64,rounds:[make(0)]},{map}).warnings.some(s=>s.includes('heights')));
  assert.ok(analyzeReplay({tickRate:64,rounds:[]},{map:{sites:{}}}).warnings.some(s=>s.includes('anchors')));
});
test('representative distinguishes reversed opening routes with identical total occupancy',()=>{
  const make=reverse=>round(roster(),{end:1920,frames:Array.from({length:481},(_,i)=>({tick:i*4,players:roster({x:(i*4<960)!==reverse?0:2000})}))});
  const a=analyzeReplay({tickRate:64,rounds:[make(true),make(false),make(false)]});
  assert.equal(a.representatives.find(r=>r.side===2).roundIndex,1);
  const h=buildHeatmap(make(false),{startSeconds:15,windowSeconds:15});
  assert.equal(h.totalSeconds,75);assert.equal(h.totalWeight,150);
});
const player=(id,team=2,extra={})=>({id:String(id),team,x:id*10,y:0,z:0,hp:100,alive:true,inventory:['AK-47','Smoke Grenade'],weapon:'knife_t',armor:100,money:100,...extra});
const roster=(extra={})=>Array.from({length:5},(_,i)=>player(i,2,extra));
const round=(players,extra={})=>({number:2,live:0,start:-20,end:320,frames:Array.from({length:81},(_,i)=>({tick:i*4,players:players.map(p=>({...p}))})),...extra});
test('missing opening samples stay unknown and freshness uses actual tick rate',()=>{
  const stale=round(roster(),{frames:[{tick:1280,players:roster()}],end:1400});
  assert.equal(classifyTeam(stale,2).label,'unknown');
  const result=analyzeReplay({tickRate:128,rounds:[stale]});
  assert.equal(result.rounds[0].teams[2].label,'unknown');
  assert.equal(result.rounds[0].teams[2].teamKey,'side-2');
  assert.equal(result.representatives.length,0);
  const delayed=round(roster(),{frames:[{tick:48,players:roster()}]});
  assert.equal(classifyTeam(delayed,2,{tickRate:64}).label,'unknown');
  assert.equal(classifyTeam(delayed,2,{tickRate:128}).label,'full-buy');
  assert.equal(analyzeReplay({tickRate:128,rounds:[delayed]}).rounds[0].teams[2].label,'full-buy');
});
test('buy labels use opening inventory even with knife held, separate teams and missing data',()=>{
  const r=round([...roster(),...roster({team:3,inventory:['USP-S'],armor:0})]);
  assert.equal(classifyTeam(r,2).label,'full-buy');
  assert.equal(classifyTeam(r,3).label,'eco');
  assert.equal(classifyTeam(r,3,{pistol:true}).label,'pistol');
  assert.equal(classifyTeam(round(roster({inventory:['MP9'],armor:100,money:100})),2).label,'force');
  assert.equal(classifyTeam(round(roster({inventory:['MP9'],armor:100,money:4000})),2).label,'mixed');
  assert.equal(classifyTeam(round(roster({inventory:[]})),2).label,'unknown');
  assert.equal(classifyTeam(round(roster().slice(0,4)),2).label,'unknown');
});
test('a held grenade is not counted twice and freeze equipment is ignored',()=>{
  const r=round(roster({inventory:['AK-47','Flashbang'],weapon:'Flashbang'}));
  r.frames.unshift({tick:-10,players:roster({inventory:['Glock-18'],armor:0})});
  assert.equal(classifyTeam(r,2).utility,5);
  assert.equal(classifyTeam(r,2).label,'full-buy');
});
test('heatmaps integrate player seconds independently of sample density and exclude freeze/dead/enemy',()=>{
  const make=step=>round([player(1),player(2,3),player(3,2,{alive:false})],{end:640,frames:Array.from({length:640/step+1},(_,i)=>({tick:i*step,players:[player(1),player(2,3),player(3,2,{alive:false})]}))});
  const a=buildHeatmap(make(4)),b=buildHeatmap(make(8));
  assert.equal(a.totalSeconds,10);assert.equal(a.totalWeight,20);
  assert.equal(a.totalWeight,b.totalWeight);assert.equal(a.points.length,1);
  const r=make(4);r.frames.unshift({tick:-64,players:[player(1)]});
  assert.equal(buildHeatmap(r).totalSeconds,10);
});
test('heatmaps split intervals at 30 seconds, clip window and cap missing samples',()=>{
  const r=round([player(1)],{end:2560,frames:Array.from({length:641},(_,i)=>({tick:i*4,players:[player(1)]}))});
  assert.equal(buildHeatmap(r).totalSeconds,40);
  assert.ok(Math.abs(buildHeatmap(r).totalWeight-(60+30/Math.LN2*(1-2**(-1/3))))<1e-9);
  assert.equal(buildHeatmap(r,{windowSeconds:30}).totalSeconds,30);
  assert.equal(buildHeatmap(r,{team:3}).color,'#3b82f6');
  const gap=round([player(1)],{end:640,frames:[{tick:0,players:[player(1)]},{tick:640,players:[player(1)]}]});
  assert.equal(buildHeatmap(gap).totalSeconds,.5);
});
test('representative is closest to average weighted pattern and identity survives halftime',()=>{
  const rounds=[0,10,1000].map((x,i)=>round([...roster({x}),...Array.from({length:5},(_,j)=>player(j+5,3,{x:2000}))],{number:i+2}));
  const flipped=round([...roster({team:3}),...Array.from({length:5},(_,j)=>player(j+5,2))],{number:13});rounds.push(flipped);
  const a=analyzeReplay({tickRate:64,rounds,pistols:[3]});
  const t=a.representatives.find(r=>r.teamKey==='team-1'&&r.side===2);
  assert.equal(t.roundIndex,0);assert.equal(t.candidateCount,3);
  assert.equal(a.rounds[3].teams[3].teamKey,'team-1');
  assert.equal(a.rounds[3].teams[3].label,'pistol');
});
test('4/5 stacks require persistent early proximity and map anchor, grouped pushes require movement',()=>{
  const ct=Array.from({length:5},(_,i)=>player(i,3,{x:i*10}));
  const r=round(ct,{end:2560,frames:Array.from({length:641},(_,i)=>({tick:i*4,players:ct.map(p=>({...p}))}))});
  const replay={tickRate:64,rounds:[r],pistols:[]};
  const map={x:0,y:0,scale:1,sites:{A:[0,0],B:[4000,4000]}};
  const tags=analyzeReplay(replay,{map}).rounds[0].specials;
  assert.equal(tags.filter(t=>t.id==='site-stack').length,1);assert.equal(tags[0].count,5);
  assert.equal(tags.filter(t=>t.id==='group-push').length,0);
  assert.equal(analyzeReplay(replay,{map:{...map,lower:'lower.png'}}).rounds[0].specials.length,0);
  const push=round(roster(),{end:2560,frames:Array.from({length:641},(_,i)=>({tick:i*4,players:roster({x:i*4>=320?1000:0})}))});
  assert.equal(analyzeReplay({tickRate:64,rounds:[push]}).rounds[0].specials[0].id,'group-push');
});
