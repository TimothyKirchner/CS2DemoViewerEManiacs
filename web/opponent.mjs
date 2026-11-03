// Opponent analyser base: find one target team across several demos by SteamID.
// A player is "core" when present in at least `coreShare` of the included demos; a demo belongs to the
// target team when at least `minCore` of its roster are core players. Names are display only.
import {indexReplay} from './scouting.mjs';

export const DEFAULT_CORE_SHARE=.5,DEFAULT_MIN_CORE=3;
const ids=v=>[...new Set((Array.isArray(v)?v:[]).filter(x=>typeof x==='string'||Number.isFinite(x)).map(String).map(s=>s.slice(0,64)))].slice(0,500);

export function normalizeOverrides(value){return {core:ids(value?.core),standIn:ids(value?.standIn),excluded:ids(value?.excluded)};}

const openingFrame=(round,rate)=>round.frames.find(f=>f.tick>=round.live&&f.tick-round.live<=rate*.5)??round.frames.find(f=>f.tick>=round.live)??round.frames[0];

// Per team key (team-1 started T, team-2 started CT): who played which rounds, and the team's side per round.
export function demoRosters(replay){
  const rate=replay.tickRate||64,out={'team-1':{players:new Map(),sides:[]},'team-2':{players:new Map(),sides:[]}};
  for(const {round,teams} of indexReplay(replay)){
    const frame=openingFrame(round,rate);
    for(const key of Object.keys(out)){
      const side=[2,3].find(s=>teams[s]===key)??null;out[key].sides.push(side);
      if(side)for(const p of frame?.players??[])if(p.team===side){const id=String(p.id);out[key].players.set(id,(out[key].players.get(id)??0)+1);}
    }
  }
  return out;
}

export function detectOpponent(entries,overrides={},{coreShare=DEFAULT_CORE_SHARE,minCore=DEFAULT_MIN_CORE}={}){
  const o=normalizeOverrides(overrides),excluded=new Set(o.excluded),forcedCore=new Set(o.core),forcedStandIn=new Set(o.standIn);
  const included=entries.filter(e=>!excluded.has(e.id)),total=included.length;
  const demos=included.map(entry=>({entry,rosters:demoRosters(entry.replay)}));
  // Appearances count once per demo, whichever side or team key the player was on.
  const appearances=new Map();
  for(const d of demos)for(const id of new Set(Object.values(d.rosters).flatMap(r=>[...r.players.keys()])))appearances.set(id,(appearances.get(id)??0)+1);
  const candidates=new Set([...appearances].filter(([id,n])=>!forcedStandIn.has(id)&&(n/total>=coreShare||forcedCore.has(id))).map(([id])=>id));
  // Candidates that shared a roster belong to the same team; pick the strongest group.
  const parent=new Map([...candidates].map(id=>[id,id])),find=id=>{while(parent.get(id)!==id){parent.set(id,parent.get(parent.get(id)));id=parent.get(id);}return id;};
  for(const d of demos)for(const r of Object.values(d.rosters)){const c=[...r.players.keys()].filter(id=>candidates.has(id));for(const id of c.slice(1))parent.set(find(id),find(c[0]));}
  const groups=new Map();for(const id of candidates){const root=find(id);if(!groups.has(root))groups.set(root,[]);groups.get(root).push(id);}
  const score=g=>g.reduce((n,id)=>n+appearances.get(id)+(forcedCore.has(id)?1000:0),0);
  const ranked=[...groups.values()].sort((a,b)=>score(b)-score(a));
  const core=new Set(ranked[0]??[]);for(const id of forcedCore)if(appearances.has(id))core.add(id);for(const id of forcedStandIn)core.delete(id);
  const ambiguous=ranked.length>1&&score(ranked[0])===score(ranked[1]);
  const matched=[],unmatched=[];
  for(const {entry,rosters} of demos){
    const options=Object.entries(rosters).map(([teamKey,r])=>({teamKey,r,core:[...r.players.keys()].filter(id=>core.has(id)).length})).sort((a,b)=>b.core-a.core);
    const best=options[0],info={entryId:entry.id,source:entry.replay.source,map:entry.replay.map,date:entry.date??'',rounds:entry.replay.rounds.length};
    if(!best||best.core<minCore||best.core===options[1]?.core){unmatched.push({...info,coreCount:best?.core??0,reason:best&&best.core>=minCore?'both teams contain core players':`only ${best?.core??0} core players (needs ${minCore})`});continue;}
    const players=[...best.r.players.keys()];
    matched.push({...info,teamKey:best.teamKey,startSide:best.r.sides.find(Boolean)??null,sides:best.r.sides,coreCount:best.core,players,standIns:players.filter(id=>!core.has(id))});
  }
  // Roster across matched demos only; latest name wins (dated demos sort by date, otherwise import order).
  const order=[...matched].map((d,i)=>({d,i})).sort((a,b)=>(a.d.date||'').localeCompare(b.d.date||'')||a.i-b.i).map(x=>x.d);
  const roster=new Map();
  for(const d of order){const entry=included.find(e=>e.id===d.entryId),names=new Map(entry.replay.players.map(p=>[String(p.id),p.name])),r=demos.find(x=>x.entry===entry).rosters[d.teamKey];
    for(const id of d.players){const p=roster.get(id)??{id,name:id,demos:0,rounds:0,maps:new Set()};p.name=names.get(id)||p.name;p.demos++;p.rounds+=r.players.get(id);p.maps.add(d.map);roster.set(id,p);}}
  const players=[...roster.values()].map(p=>({...p,maps:[...p.maps].sort(),core:core.has(p.id),label:core.has(p.id)?'core':'stand-in',override:forcedCore.has(p.id)?'core':forcedStandIn.has(p.id)?'stand-in':'',description:`${core.has(p.id)?'core':'stand-in'}, ${p.demos} of ${matched.length} demos`}))
    .sort((a,b)=>Number(b.core)-Number(a.core)||b.demos-a.demos||b.rounds-a.rounds||a.name.localeCompare(b.name));
  const byMap={};for(const d of matched)(byMap[d.map]??={map:d.map,demos:0,rounds:0,entryIds:[]}),byMap[d.map].demos++,byMap[d.map].rounds+=d.rounds,byMap[d.map].entryIds.push(d.entryId);
  return {total,coreShare,minCore,ambiguous,overrides:o,core:[...core],players,demos:matched,unmatched,
    excluded:entries.filter(e=>excluded.has(e.id)).map(e=>({entryId:e.id,source:e.replay.source,map:e.replay.map})),maps:Object.values(byMap).sort((a,b)=>b.demos-a.demos||a.map.localeCompare(b.map))};
}

// Round references for the target team, with its side in each round (side switches and overtime included).
export function opponentRounds(entries,detection){
  const out=[];for(const d of detection.demos){if(!entries.some(e=>e.id===d.entryId))continue;d.sides.forEach((side,roundIndex)=>{if(side)out.push({entryId:d.entryId,roundIndex,map:d.map,side});});}
  return out;
}
