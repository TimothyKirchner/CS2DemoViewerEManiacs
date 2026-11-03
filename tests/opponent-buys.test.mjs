import test from 'node:test';
import assert from 'node:assert/strict';
import {playerValue,teamValue,classifyBuy,siteOf,roundFacts,buyLibrary,summarizeBucket} from '../web/opponent-buys.mjs';
import {detectOpponent,opponentRounds} from '../web/opponent.mjs';
import {makeEntry} from '../web/session.mjs';

// Synthetic players only: "o*" are the target opponent, "x*" the other team.
const O=['o1','o2','o3','o4','o5'],X=['x1','x2','x3','x4','x5'];
const MAP={x:0,y:0,scale:1,sites:{A:[2000,0],B:[-2000,0]}}; // world A = (2000,0), B = (-2000,0); x=0 is 2000 from both (mid)
const LOADOUT={
  pistol:{inventory:['Glock-18'],armor:0,money:600},
  eco:{inventory:['Glock-18'],armor:0,money:3000},
  full:{inventory:['AK-47','Glock-18','Smoke Grenade','Flashbang','Molotov'],armor:100,hasHelmet:true,money:1500},
  force:{inventory:['Galil AR','Glock-18'],armor:100,money:200},
  half:{inventory:['Desert Eagle','Flashbang'],armor:100,money:3500},
};
const player=(id,team,kind,extra={})=>({id,team,x:0,y:0,z:0,hp:100,alive:true,weapon:'knife',...LOADOUT[kind],...extra});
// One round: target team on `side` with `buy`, enemy with `enemyBuy`; options add events and effects.
function round(i,{side=2,buy='full',enemyBuy='full',winner=side,plantAt=null,contact=null,dead=0,smokes=0}={}){
  const start=i*10000,live=start+100,end=live+64*80,enemy=side===2?3:2;
  const frames=[{tick:live,players:[...O.map(id=>player(id,side,buy)),...X.map(id=>player(id,enemy,enemyBuy))]},
    {tick:end,players:[...O.map((id,k)=>({...player(id,side,buy),alive:k>=dead,hp:k>=dead?100:0})),...X.map(id=>player(id,enemy,enemyBuy))]}];
  const events=[];
  if(contact)events.push({event_name:'player_hurt',tick:live+contact.seconds*64,user_team_num:enemy,attacker_team_num:side,user_X:contact.x,user_Y:0,attacker_X:contact.x,attacker_Y:0});
  if(plantAt)events.push({event_name:'bomb_planted',tick:live+64*40,user_X:plantAt,user_Y:0,user_team_num:2});
  const effects=Array.from({length:smokes},(_,k)=>({type:'smoke',start:live+k,end:live+k+64,team:side,thrower:'o1'}));
  return {number:i+1,start,live,end,winner,frames,events,effects,grenades:[]};
}
const replay=(rounds,map='de_test')=>({version:1,source:`${map}.dem`,map,tickRate:64,players:[...O,...X].map(id=>({id,name:`Name ${id}`})),rounds,pistols:[0]});

test('equipment value counts weapons, utility, armor and kit',()=>{
  assert.equal(playerValue(player('a',2,'full')),2700+200+300+200+400+1000);
  assert.equal(playerValue({inventory:['weapon_m4a1_silencer'],armor:50,hasHelmet:false,hasDefuser:true}),2900+650+400);
  assert.equal(playerValue({inventory:[],weapon:'weapon_awp',armor:0}),4750);
});

test('team value takes the best sample in the first seconds and scales four players to five',()=>{
  const r=round(0);r.frames[0].players=r.frames[0].players.filter(p=>p.id!=='o5');
  const v=teamValue(r,2);assert.equal(v.players,4);assert.equal(v.scaled,Math.round(v.value*5/4));
  r.frames[0].players=r.frames[0].players.filter(p=>!['o4','o3'].includes(p.id));assert.equal(teamValue(r,2).scaled,null);
});

test('buy classes follow equipment value, bank and the enemy buy',()=>{
  const v=kind=>teamValue(round(1,{buy:kind,enemyBuy:kind}),2);
  assert.equal(classifyBuy({pistol:true,own:v('full')}).type,'pistol');
  assert.equal(classifyBuy({own:v('eco'),enemy:v('full')}).type,'eco');
  assert.equal(classifyBuy({own:v('full'),enemy:v('full')}).type,'full');
  assert.equal(classifyBuy({own:v('full'),enemy:v('eco')}).type,'anti-eco');
  assert.equal(classifyBuy({own:v('force'),enemy:v('full')}).type,'force');
  assert.equal(classifyBuy({own:v('half'),enemy:v('full')}).type,'half');
  assert.equal(classifyBuy({own:{known:false,scaled:null}}).type,'unknown');
});

test('sites resolve from calibrated anchors',()=>{
  assert.equal(siteOf(MAP,900,100),'A');assert.equal(siteOf(MAP,-1100,0),'B');assert.equal(siteOf(MAP,0,5000),'mid / other');assert.equal(siteOf({},0,0),'unknown');
});

test('round facts: route, first contact, utility, outcome and post-plant save',()=>{
  const e=makeEntry(replay([round(0),round(1,{plantAt:1000,contact:{seconds:20,x:900},smokes:3,winner:3,dead:3})]),{id:'e'});
  const f=roundFacts(e,{entryId:'e',roundIndex:1,side:2},MAP);
  assert.equal(f.type,'full');assert.equal(f.route,'A plant');assert.equal(f.contactSeconds,20);assert.equal(f.utility.smoke,3);
  assert.equal(f.won,false);assert.equal(f.survivors,2);assert.equal(f.postPlantSave,true);
  const ct=roundFacts(makeEntry(replay([round(0),round(1,{side:3,contact:{seconds:12,x:-950}})]),{id:'c'}),{entryId:'c',roundIndex:1,side:3},MAP);
  assert.equal(ct.route,'contact B');assert.equal(ct.won,true);assert.equal(ct.postPlantSave,false);
});

test('library groups by map and side, reports samples, win rate and a representative round',()=>{
  // Opponent on T: pistol, then 3 full buys (2 A plants won, 1 B plant lost), an eco, a post-plant save; then CT rounds.
  const rounds=[round(0,{buy:'pistol',enemyBuy:'pistol'}),round(1,{plantAt:1000,contact:{seconds:18,x:950}}),round(2,{plantAt:1000,contact:{seconds:22,x:950}}),
    round(3,{plantAt:-1000,contact:{seconds:40,x:-950},winner:3}),round(4,{buy:'eco',winner:3}),round(5,{buy:'force',plantAt:1000,winner:3,dead:4}),
    round(6,{side:3,contact:{seconds:30,x:0}}),round(7,{side:3,enemyBuy:'eco',contact:{seconds:15,x:-1000}})];
  const entries=[makeEntry(replay(rounds),{id:'a'})];
  const refs=rounds.map((r,roundIndex)=>({entryId:'a',roundIndex,map:'de_test',side:r.frames[0].players[0].team}));
  const lib=buyLibrary(entries,refs,{mapDefs:{de_test:MAP}});
  assert.equal(lib.maps.length,1);assert.ok(lib.maps[0].sites);
  const t=lib.maps[0].sides.find(s=>s.side===2),ct=lib.maps[0].sides.find(s=>s.side===3);
  assert.equal(t.rounds,6);assert.equal(ct.rounds,2);
  const full=t.types.find(x=>x.type==='full');
  assert.equal(full.sample,'3 of 6 rounds');assert.equal(full.route.name,'A plant');assert.equal(full.route.sample,'2 of 3');
  assert.equal(full.wins,2);assert.equal(full.decided,3);assert.equal(full.contactSeconds,22);
  assert.equal(full.representative.roundIndex,2,'A plant with contact nearest the median');
  assert.deepEqual(t.types.map(x=>x.type),['pistol','eco','force','full','post-plant-save']);
  assert.deepEqual(t.types.find(x=>x.type==='post-plant-save').rounds.map(r=>r.roundIndex),[3,5],'lost after a plant with survivors');
  assert.deepEqual(ct.types.map(x=>x.type),['full','anti-eco']);
  assert.equal(ct.types.find(x=>x.type==='full').route.name,'contact mid / other');
  assert.ok(lib.warnings.every(w=>/Heuristic|Route/.test(w)));
});

test('library works on detected opponent rounds across side switches',()=>{
  const rounds=[0,1,2,3].map(i=>round(i,{side:i<2?2:3}));
  const entries=[makeEntry(replay(rounds),{id:'a'}),makeEntry(replay(rounds.map(r=>structuredClone(r))),{id:'b'})];
  const d=detectOpponent(entries);
  const lib=buyLibrary(entries,opponentRounds(entries,d),{mapDefs:{}});
  assert.equal(lib.maps[0].sites,false);
  const sides=lib.maps[0].sides;assert.equal(sides[0].rounds+sides[1].rounds,8);
  assert.ok(lib.rounds.every(r=>r.route==='no plant'||r.route==='no contact'));
});

test('empty buckets are skipped and summaries tolerate missing contact',()=>{
  const s=summarizeBucket('eco',[],0);assert.equal(s.representative,null);assert.equal(s.winRate,null);
});
