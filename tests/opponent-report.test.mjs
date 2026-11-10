import test from 'node:test';
import assert from 'node:assert/strict';
import {opponentMapResults,vetoSuggestion,sideHabits,standInNotes,economyNotes,antiStratReport,renderAntiStrat,topReads} from '../web/opponent-report.mjs';
import {detectOpponent,opponentRounds} from '../web/opponent.mjs';
import {prepReport} from '../web/scouting.mjs';
import {makeEntry} from '../web/session.mjs';

// Synthetic players only: "o*" are the target opponent (CT in every round), "s1" a stand-in, "x*" the enemy (new ids per demo).
// World on both maps: site A at x=2000, B at x=-2000, mid at 0.
const MAP={x:0,y:0,scale:1,sites:{A:[2000,0],B:[-2000,0]}},mapDefs={de_test:MAP,de_two:MAP};
const SPOT={A:{x:2000,place:'BombsiteA'},mid:{x:0,place:'Middle'},B:{x:-2000,place:'BombsiteB'}};
const at=(id,team,spot)=>({id,team,x:SPOT[spot].x,y:0,z:0,hp:100,alive:true,weapon:'knife',place:SPOT[spot].place,inventory:['AK-47','Glock-18'],armor:100,hasHelmet:true,money:1500});
const DEFAULT={o1:'A',o2:'A',o3:'mid',o4:'B',o5:'B'};
function round(i,{layout=DEFAULT,winner=3,smokeAt=null,e='x'}={}){
  const start=i*20000,live=start+15*64,end=live+64*80;
  const sample=t=>({tick:live+t*64,players:[...Object.entries(layout).map(([id,s])=>at(id,3,s)),...[1,2,3,4,5].map(k=>at(`${e}${k}`,2,'mid'))]});
  return {number:i+1,start,live,end,winner,events:[],grenades:[],frames:[sample(0),sample(15),sample(20)],
    effects:smokeAt===null?[]:[{type:'smoke',start:live+smokeAt*64,end:live+smokeAt*64+320,x:-1900,y:0,z:0,id:`s${i}`,thrower:'o4',team:3}]};
}
const replay=(map,rounds)=>({version:1,source:`${map}.dem`,map,tickRate:64,rounds,pistols:[0],metadata:{recording:'broadcast',eventCoverage:{deaths:true,damage:true,blinds:true}},
  players:[...new Set(rounds.flatMap(r=>r.frames[0].players.map(p=>p.id)))].map(id=>({id,name:id==='o1'?'Lead<b>':`Name ${id}`}))});
function setup(){
  // de_test: 8 rounds, 6 won, o4 always on B, smoke on B at 8 s in every round.
  const a=makeEntry(replay('de_test',[0,1,2,3,4,5,6,7].map(i=>round(i,{winner:i<6?3:2,smokeAt:8}))),{id:'a'});
  // de_test again with stand-in s1 instead of o5 (2 rounds, both lost).
  const b=makeEntry(replay('de_test',[0,1].map(i=>round(i,{layout:{o1:'A',o2:'A',o3:'mid',o4:'B',s1:'B'},winner:2,e:'y'}))),{id:'b'});
  // de_two: 6 rounds, 1 won.
  const c=makeEntry(replay('de_two',[0,1,2,3,4,5].map(i=>round(i,{winner:i===0?3:2,e:'z'}))),{id:'c'});
  const entries=[a,b,c],d=detectOpponent(entries);
  return {entries,d,refs:opponentRounds(entries,d)};
}

test('map results count rounds, sides and matches of the target team',()=>{
  const {entries,d}=setup(),r=opponentMapResults(entries,d),t=r.find(x=>x.map==='de_test'),two=r.find(x=>x.map==='de_two');
  assert.equal(t.demos,2);assert.equal(t.rounds,10);assert.equal(t.wins,6);assert.equal(t.decided,10);assert.equal(t.matchWins,1);assert.equal(t.matchLosses,1);
  assert.equal(t.sample,'6 of 10 decided rounds won');assert.equal(t.sideRates[3],.6);assert.equal(t.sideRates[2],null);
  assert.equal(two.wins,1);assert.equal(two.matchLosses,1);assert.equal(r[0].map,'de_test');
});

test('veto bans their strongest map, picks their weakest, and lists unseen pool maps',()=>{
  const {entries,d}=setup(),v=vetoSuggestion(opponentMapResults(entries,d),{pool:['de_test','de_two','de_other'],minRounds:5});
  assert.equal(v.ban.map,'de_test');assert.equal(v.pick.map,'de_two');assert.deepEqual(v.unseen,['de_other']);assert.equal(v.heuristic,true);
  assert.match(v.ban.reason,/60% of rounds won \(6 of 10 decided rounds won\), matches 1-1/);
  assert.ok(v.notes.some(n=>/de_other/.test(n)));
  // Maps outside the pool are ignored; one map only means no pick.
  const one=vetoSuggestion(opponentMapResults(entries,d),{pool:['de_two']});assert.equal(one.ban.map,'de_two');assert.equal(one.pick,null);
  assert.ok(one.notes.some(n=>/Small sample/.test(n)));
});

test('side habits name core anchors with samples and evidence, never stand-ins',()=>{
  const {entries,d}=setup(),report=antiStratReport(entries,d,{mapDefs,pool:['de_test','de_two']});
  const ct=report.maps.find(m=>m.map==='de_test').sides.find(s=>s.side===3);
  assert.equal(ct.rounds,10);
  const anchor=ct.habits.find(h=>h.kind==='position'&&h.player==='Name o4');
  assert.ok(anchor);assert.equal(anchor.text,'BombsiteB (B) anchored by Name o4');assert.equal(anchor.sample,'10 of 10 rounds');assert.equal(anchor.heuristic,true);
  assert.ok(anchor.evidence.length>0&&anchor.evidence.length<=5);assert.ok(anchor.evidence.every(e=>['a','b'].includes(e.entryId)&&Number.isFinite(e.tick)));
  assert.ok(!ct.habits.some(h=>/s1|Name s1/.test(h.text)));
  const smoke=ct.habits.find(h=>h.kind==='utility');assert.ok(smoke);assert.match(smoke.text,/^Smoke near .* at 8 s/);assert.equal(smoke.sample,'8 of 10 rounds');
  assert.ok(ct.habits.some(h=>h.kind==='setup'&&h.share===1));
  // Too few rounds: no habits.
  assert.deepEqual(sideHabits(3,{pos:{rounds:2,players:[]},tend:{rounds:2}}),[]);
});

test('stand-in notes and economy notes carry sample sizes',()=>{
  const {d}=setup(),notes=standInNotes(d,'de_test');
  assert.ok(notes.some(n=>n==='Name s1: stand-in, 1 of 3 demos. Not named in player habits; counts only in team totals.'));
  assert.ok(notes.some(n=>n.startsWith('1 of 2 demos on de_test had a stand-in')));
  assert.deepEqual(standInNotes(d,'de_two'),[]);
  const e=economyNotes({rows:[{label:'After a lost T pistol',count:8,force:5,half:1,eco:2,full:0},{label:'Empty',count:0}]});
  assert.equal(e.length,1);assert.equal(e[0].sample,'6 of 8 rounds');assert.match(e[0].counter,/Expect a force/);
  const n=economyNotes({rows:[{label:'After a won pistol',count:8,force:0,half:0,next:[{type:'eco',label:'Eco',count:1},{type:'full',label:'Full buy',count:7}]}]});
  assert.equal(n[0].text,'After a won pistol: next round mostly full buy');assert.equal(n[0].sample,'7 of 8 rounds');assert.match(n[0].counter,/full buy/);
});

test('markdown and HTML exports; prepReport embeds the page as a section',()=>{
  const {entries,d}=setup(),report=antiStratReport(entries,d,{mapDefs,pool:['de_test','de_two'],title:'Beat <them>'});
  const md=renderAntiStrat(report,'markdown');
  for(const s of ['# Beat <them>','## de_test: how to beat them','### Their CT side (10 rounds, top reads not repeated)','Counter (heuristic)','Ban de_test','Pick de_two','Evidence: R1 · de_test.dem (tick','Name s1: stand-in, 1 of 3 demos'])assert.ok(md.includes(s),s);
  assert.ok(md.includes('small sample'));// de_two has 6 rounds
  const html=renderAntiStrat(report,'html');
  assert.match(html,/^<!doctype html>/);assert.ok(html.includes('Beat &lt;them&gt;'));assert.ok(html.includes('Lead&lt;b&gt;'));assert.ok(!html.includes('Lead<b>'));assert.ok(!html.includes('data-play'));
  const live=renderAntiStrat(report,'html',{play:true});
  assert.match(live,/^<div class="anti-strat">/);assert.match(live,/data-play="a" data-round="\d+" data-tick="\d+"/);
  const prep=prepReport({title:'Prep',sections:[{markdown:md,html:renderAntiStrat(report,'html',{fragment:true})}]});
  assert.ok(prep.includes('## de_test: how to beat them'));
  const prepHtml=prepReport({title:'Prep',sections:[{markdown:md,html:renderAntiStrat(report,'html',{fragment:true})}]},'html');
  assert.ok(prepHtml.includes('<div class="anti-strat"><h1>Beat &lt;them&gt;</h1>'));assert.equal((prepHtml.match(/<!doctype/g)??[]).length,1);
  assert.equal(prepReport({title:'Prep'}).includes('how to beat them'),false);
});

test('utility timing is "fixed" only for tight windows, unknown callouts are dropped, duels need an edge',()=>{
  const cl=(place,early,late,rounds)=>({clusters:[{place,x:1,y:2,share:.8,rounds,medianSeconds:early+1,earlySeconds:early,lateSeconds:late,evidence:[]}]});
  const tend=(smoke,fire,flash,wins=6,count=12)=>({rounds:12,utility:{types:{smoke,fire,flash}},duels:{openings:{wins,count,winRate:wins/count}}});
  const h=sideHabits(3,{tend:tend(cl('Middle',7,21,10),cl('Ramp',7,8,10),cl('unknown',5,6,10))});
  const u=h.filter(x=>x.kind==='utility');
  assert.equal(u.length,2,'cluster without a callout is dropped');
  assert.ok(u.find(x=>x.text.includes('Middle')).text.includes('timing varies'));
  assert.ok(!u.find(x=>x.text.includes('Middle')).counter.includes('fixed time'));
  assert.ok(u.find(x=>x.text.includes('Ramp')).counter.includes('lands by 8 s'),'CT utility counter is side-aware');
  assert.equal(sideHabits(3,{tend:{rounds:4,utility:{types:{smoke:cl('Ramp',7,8,4)}}}})[0].counter,'','no counter below 5 rounds');
  assert.ok(!h.some(x=>x.kind==='openings'),'50 % openings are no habit');
  assert.ok(sideHabits(3,{tend:tend(null,null,null,9,12)}).some(x=>x.kind==='openings'),'75 % openings are a habit');
  assert.ok(!JSON.stringify(h).includes('x 1'),'no raw coordinates');
});

test('top reads skip small samples; veto flags maps with one demo',()=>{
  const sides=[{side:3,habits:[{text:'a',share:.9,total:5,small:true},{text:'b',share:.7,total:20,small:false}]},{side:2,habits:[{text:'c',share:.6,total:30,small:false}]}];
  assert.deepEqual(topReads(sides).map(x=>x.text),['b','c'],'distance from 50 % weighted by sample');
  const r=(map,wins,decided,demos)=>({map,wins,decided,demos,winRate:wins/decided,sample:`${wins} of ${decided}`,matchWins:1,matchLosses:0,matchDraws:0});
  const v=vetoSuggestion([r('de_ancient',30,50,3),r('de_anubis',10,25,1)]);
  assert.ok(v.notes.some(n=>n.includes('Weak data')&&n.includes('de_anubis')));
});

test('wording follows the number',async()=>{
  const {often}=await import('../web/opponent-report.mjs');
  assert.equal(often(.46),'in about half of the rounds');assert.equal(often(.7),'in most rounds');assert.equal(often(.3),'in some rounds');
});
