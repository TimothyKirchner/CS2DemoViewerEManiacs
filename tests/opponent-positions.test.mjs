import test from 'node:test';
import assert from 'node:assert/strict';
import {zoneOf,setupLabel,roundScores,filterRounds,positionHeatmap,sideSetups,positionAnalysis,WINDOWS} from '../web/opponent-positions.mjs';
import {detectOpponent,opponentRounds} from '../web/opponent.mjs';
import {buyLibrary} from '../web/opponent-buys.mjs';
import {makeEntry} from '../web/session.mjs';

// Synthetic players only: "o*" are the target opponent, "s1" a stand-in, "x*" the other team.
// Each demo has a different enemy team (prefix), so only the o* players repeat.
const X=(e='x')=>[1,2,3,4,5].map(k=>e+k);
const MAP={x:0,y:0,scale:1,sites:{A:[2000,0],B:[-2000,0]}}; // world A = (2000,0), B = (-2000,0)
const SPOT={A:{x:2000,place:'BombsiteA'},mid:{x:0,place:'Middle'},B:{x:-2000,place:'BombsiteB'},cat:{x:600,place:'Catwalk'}};
const DEFAULT={o1:'A',o2:'A',o3:'mid',o4:'B',o5:'B'};
const FULL={inventory:['AK-47','Glock-18'],armor:100,hasHelmet:true,money:1500};
const at=(id,team,spot,extra={})=>({id,team,x:SPOT[spot].x,y:0,z:0,hp:100,alive:true,weapon:'knife',place:SPOT[spot].place,...FULL,...extra});
// One round with samples at 0, 15, 20 and 45 s. `layout` maps player -> spot; `later` changes spots at 45 s.
function round(i,{side=3,layout=DEFAULT,later={},winner=side,awp=null,e='x'}={}){
  const start=i*10000,live=start+100,end=live+64*80,enemy=side===2?3:2;
  const sample=(t,spots)=>({tick:live+t*64,players:[...Object.entries(spots).map(([id,s])=>at(id,side,s,id===awp?{weapon:'weapon_awp'}:{})),...X(e).map(id=>at(id,enemy,'mid'))]});
  return {number:i+1,start,live,end,winner,events:[],effects:[],grenades:[],
    frames:[sample(0,layout),sample(15,layout),sample(20,layout),sample(45,{...layout,...later})]};
}
const replay=(rounds,map='de_test',names={})=>({version:1,source:`${map}.dem`,map,tickRate:64,rounds,pistols:[],
  players:[...new Set(rounds.flatMap(r=>r.frames[0].players.map(p=>p.id)))].map(id=>({id,name:names[id]??`Name ${id}`}))});
const mapDefs={de_test:MAP};
function setup(){
  const a=makeEntry(replay([round(0,{awp:'o4'}),round(1,{later:{o3:'B'},winner:2}),round(2,{layout:{o1:'A',o2:'cat',o3:'mid',o4:'B',o5:'B'}})]),{id:'a'});
  const b=makeEntry(replay([round(0,{e:'y'}),round(1,{winner:2,e:'y'}),round(2,{winner:2,e:'y'})]),{id:'b'});
  // Demo c: o5 is missing and the stand-in s1 stands on o5's usual spot.
  const c=makeEntry(replay([round(0,{layout:{o1:'A',o2:'A',o3:'mid',o4:'B',s1:'B'},awp:'s1',e:'z'})]),{id:'c'});
  const entries=[a,b,c],d=detectOpponent(entries);return {entries,d,refs:opponentRounds(entries,d)};
}

test('zones use the bombsite callout, then calibrated site anchors',()=>{
  assert.equal(zoneOf(MAP,{x:1900,y:100,place:'Anything'}),'A');
  assert.equal(zoneOf(MAP,{x:0,y:0,place:'BombsiteA'}),'A','bombsite callout wins over anchors');
  assert.equal(zoneOf(MAP,{x:-1900,y:0,place:'Middle'}),'B');
  assert.equal(zoneOf({},{x:0,y:0,place:'BombsiteB'}),'B');
  assert.equal(zoneOf({},{x:0,y:0,place:'Middle'}),'mid');
  assert.equal(setupLabel({A:2,mid:1,B:2}),'A 2 / mid 1 / B 2');
});

test('score state before each round follows earlier winners of the target team',()=>{
  const {entries,d}=setup(),s=roundScores(entries,d);
  assert.deepEqual(['a:0','a:1','a:2'].map(k=>s.get(k).state),['tied','leading','tied']);
  assert.deepEqual(['b:2'].map(k=>[s.get(k).own,s.get(k).enemy]),[[1,1]]);
});

test('filters narrow rounds by map, side, buy type and score',()=>{
  const {entries,d,refs}=setup(),scores=roundScores(entries,d),buyRounds=buyLibrary(entries,refs,{mapDefs}).rounds;
  assert.equal(filterRounds(refs,{side:3}).length,7);
  assert.equal(filterRounds(refs,{side:2}).length,0);
  assert.equal(filterRounds(refs,{score:'leading'},{scores}).length,2);
  assert.equal(filterRounds(refs,{buyType:'pistol'},{buyRounds}).length,3,'first round of each demo');
  assert.equal(filterRounds(refs,{buyType:'half'},{buyRounds}).length,4);assert.equal(filterRounds(refs,{buyType:'full'},{buyRounds}).length,0);
});

test('CT setup table counts zones, shares, rotations and AWP spots',()=>{
  const {entries,d,refs}=setup(),names=new Map(d.players.filter(p=>p.core).map(p=>[p.id,p.name]));
  const ct=sideSetups(entries,refs.filter(r=>r.side===3),{mapDefs,detection:d,names});
  assert.equal(ct.rounds,7);
  assert.equal(ct.setups[0].label,'A 2 / mid 1 / B 2');assert.equal(ct.setups[0].count,6);assert.equal(ct.setups[0].sample,'6 of 7 rounds');
  assert.equal(ct.setups[1].label,'A 1 / mid 2 / B 2');
  const o4=ct.players.find(p=>p.id==='o4');assert.equal(o4.place,'BombsiteB');assert.equal(o4.zone,'B');assert.equal(o4.sample,'7 of 7 rounds');
  assert.equal(ct.players.some(p=>p.id==='s1'),false,'no per-player claims for stand-ins');
  assert.equal(ct.rotations.moves,1);assert.equal(ct.rotations.list[0].move,'mid → B');assert.equal(ct.rotations.list[0].players[0].label,'Name o3');
  assert.equal(ct.awp.rounds,2);assert.equal(ct.awp.spots[0].place,'BombsiteB');
});

test('a stand-in on the spot of an absent core player is labelled filled by stand-in',()=>{
  const {entries,d,refs}=setup();assert.ok(d.core.includes('o5'));assert.ok(!d.core.includes('s1'));
  const a=positionAnalysis(entries,d,refs,{mapDefs}),b=a.maps[0].ct.spots.find(s=>s.place==='BombsiteB');
  assert.ok(b.holders.some(h=>h.label==='filled by stand-in (usually Name o5)'&&h.count===1));
  assert.ok(a.maps[0].ct.awp.spots[0].holders.some(h=>h.label.startsWith('filled by stand-in')));
  assert.equal(a.maps[0].t.rounds,0);assert.equal(a.rounds,7);
});

test('heatmaps cover the team or one player per time window, with callouts',()=>{
  const {entries,refs}=setup(),ct=refs.filter(r=>r.side===3);
  assert.deepEqual(WINDOWS.map(w=>w.id),['0-20','20-45','45+']);
  const team=positionHeatmap(entries,ct,{window:'0-20'});
  assert.equal(team.rounds,7);assert.ok(team.playerSeconds>0);assert.equal(team.places[0].place,'BombsiteB');
  const one=positionHeatmap(entries,ct,{window:'0-20',player:'o5'});
  assert.equal(one.rounds,6);assert.equal(one.places.length,1);assert.equal(one.places[0].place,'BombsiteB');
  const late=positionHeatmap(entries,ct,{window:'45+',player:'o3'});
  assert.ok(late.places.some(p=>p.place==='BombsiteB'),'rotation shows in the late window');
});
