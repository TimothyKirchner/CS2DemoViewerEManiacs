// Opponent analyser, positions and setups: team and per-player heatmaps by time window, CT setups,
// T default spots and AWP positions for the target team. Callouts come from the parser's last_place_name
// (frame player `place`). Every zone and setup here is a heuristic from sampled positions.
import {aggregateHeatmap} from './scouting.mjs';
import {siteOf} from './opponent-buys.mjs';

export const WINDOWS=Object.freeze([
  {id:'0-20',label:'0-20 s',startSeconds:0,endSeconds:20},
  {id:'20-45',label:'20-45 s',startSeconds:20,endSeconds:45},
  {id:'45+',label:'45 s+',startSeconds:45,endSeconds:600},
]);
export const SCORE_STATES=Object.freeze([['leading','Leading'],['tied','Tied'],['trailing','Trailing']]);
// Setup sample times after freeze end: CTs have settled by 15 s, T defaults by 20 s.
export const SETUP_SECONDS=Object.freeze({2:20,3:15});
export const ROTATION_SECONDS=45,AFTER_PLANT_SECONDS=5;

const alive=p=>p.alive!==false&&p.hp!==0;
const isAwp=p=>[p.weapon,...(Array.isArray(p.inventory)?p.inventory:[])].some(w=>/^(weapon_)?awp$/i.test(String(typeof w==='string'?w:(w?.name??w?.weapon_name??''))));
const refKey=r=>`${r.entryId}:${r.roundIndex}`;

// Score before each target-team round, from earlier round winners in that demo.
export function roundScores(entries,detection){
  const out=new Map();
  for(const d of detection.demos){
    const entry=entries.find(e=>e.id===d.entryId);if(!entry)continue;let own=0,enemy=0;
    entry.replay.rounds.forEach((round,roundIndex)=>{
      const side=d.sides[roundIndex];
      if(side)out.set(`${d.entryId}:${roundIndex}`,{own,enemy,state:own>enemy?'leading':own<enemy?'trailing':'tied'});
      const w=Number(round.winner);if(side&&[2,3].includes(w)){if(w===side)own++;else enemy++;}
    });
  }
  return out;
}

// Rounds after the map / side / buy type / score filters. `buyRounds` = buyLibrary(...).rounds.
export function filterRounds(refs,{map,side,buyType,score}={},{buyRounds=[],scores=new Map()}={}){
  const types=new Map(buyRounds.map(r=>[refKey(r),r]));
  return refs.filter(r=>(!map||r.map===map)&&(!side||r.side===Number(side))
    &&(!buyType||(buyType==='post-plant-save'?types.get(refKey(r))?.postPlantSave:types.get(refKey(r))?.type===buyType))
    &&(!score||scores.get(refKey(r))?.state===score));
}

// Callouts that are never part of a site, whatever their distance to a site anchor (the 1400-unit anchor
// radius otherwise pulls e.g. anubis Middle or ancient Outside into a site).
export const MID_CALLOUTS=Object.freeze({'*':['Middle','TopofMid','MidDoors','Mid','TSpawn','CTSpawn','TStairs'],
  de_ancient:['Outside'],de_anubis:['Canal','Street','CTSideUpper'],de_mirage:['Connector','Window','Underpass','Jungle'],
  de_inferno:['Mid','SecondMid','Arch'],de_dust2:['MidDoors','Xbox','Catwalk','LowerTunnel'],de_nuke:['Lobby','Mini','Silo','Hut'],de_overpass:['Fountain','Connector','Underpass']});
const midSet=new Map();
const isMidCallout=(mapDef,place)=>{const name=String(mapDef?.map??mapDef?.name??'').toLowerCase(),key=name.startsWith('de_')?name:`de_${name}`;
  if(!midSet.has(key))midSet.set(key,new Set([...MID_CALLOUTS['*'],...(MID_CALLOUTS[key]??[])].map(x=>x.toLowerCase())));
  return midSet.get(key).has(place.toLowerCase());};

// A for site A, B for site B, else mid. The game's bombsite callout decides first, then known mid callouts,
// then the nearest calibrated site anchor; everything else (and maps without anchors) counts as mid.
export function zoneOf(mapDef,p){
  const place=String(p.place??'');
  if(/^bombsite_?a$/i.test(place))return 'A';if(/^bombsite_?b$/i.test(place))return 'B';
  if(place&&isMidCallout(mapDef,place))return 'mid';
  const site=siteOf(mapDef,p.x,p.y);return site==='A'||site==='B'?site:'mid';
}
export const setupLabel=zones=>`A ${zones.A??0} / mid ${zones.mid??0} / B ${zones.B??0}`;

function frameAt(round,tick,rate){let best=null;for(const f of round.frames){if(f.tick>tick)break;best=f;}return best&&tick-best.tick<=rate*.5?best:null;}
const ctx=(entries)=>{const byId=new Map(entries.map(e=>[e.id,e]));return ref=>{const entry=byId.get(ref.entryId),round=entry?.replay.rounds[ref.roundIndex];return round?{entry,round,rate:entry.replay.tickRate||64}:null;};};

// Rows in the shape aggregateHeatmap expects; `player` narrows the samples to one SteamID, or with
// AWP_PLAYER to whoever on the target side holds or carries an AWP in that sample ("where is the AWP").
export const AWP_PLAYER='awp';
function heatRows(entries,refs,player){
  const get=ctx(entries),rows=[];
  for(const ref of refs){const c=get(ref);if(!c)continue;
    const keep=player===AWP_PLAYER?p=>p.team===ref.side&&isAwp(p):p=>String(p.id)===player;
    const round=player?{...c.round,frames:c.round.frames.map(f=>({tick:f.tick,players:f.players.filter(keep)}))}:c.round;
    rows.push({round,roundIndex:ref.roundIndex,entry:c.entry,side:ref.side,map:ref.map,rate:c.rate});}
  return rows;
}
// Player seconds per callout inside the window (same 0.5 s gap cap as aggregateHeatmap).
function placeSeconds(rows,{startSeconds,endSeconds}){
  const out=new Map();
  for(const row of rows){const {round,rate}=row,start=round.live+startSeconds*rate,end=Math.min(round.end,round.live+endSeconds*rate),fr=round.frames;
    for(let i=0;i<fr.length;i++){const f=fr[i],a=Math.max(start,f.tick),b=Math.min(end,fr[i+1]?.tick??round.end,f.tick+rate*.5);if(b<=a)continue;
      for(const p of f.players)if(p.team===row.side&&alive(p)){const k=p.place||'unknown';out.set(k,(out.get(k)??0)+(b-a)/rate);}}}
  const total=[...out.values()].reduce((s,v)=>s+v,0);
  return [...out].sort((a,b)=>b[1]-a[1]).map(([place,seconds])=>({place,seconds,share:total?seconds/total:0}));
}

// Hold spots. Step 1, per player and round: a dwell is a stretch where the player does not leave a small area
// (HOLD_BOX units wide and deep, about a 120-unit radius), so jiggle peeks and crouch-strafing still count as
// holding. A box, not a moving centre, keeps a slow walker from dragging the dwell along. Excursions out of the
// box shorter than HOLD_PEEK_SECONDS (wide swings, a quick peek) are ignored; a longer one closes the dwell and
// starts a new one where the player is. Dwells shorter than `minSeconds` are dropped (walk-outs, rotations),
// and so are dwells within HOLD_RADIUS of where the player stood at freeze end (standing in spawn is not a hold).
// Step 2, across rounds: dwells within HOLD_RADIUS (and HOLD_FLOOR_Z height, so stacked floors stay apart)
// are clustered greedily, longest first, then reassigned once to the nearest final centre. A spot's share is
// the rounds with a dwell there over all rounds; spots in fewer than 2 rounds (with 3+ rounds) or under
// `minShare` are dropped, unless one player holds it in HOLD_MIN_PLAYER_SHARE of his own rounds (a player
// who always plays one spot is a habit even when the team share is low, as on FACEIT Mappio's per-player view).
export const HOLD_BOX=240,HOLD_PEEK_SECONDS=1,HOLD_RADIUS=220,HOLD_FLOOR_Z=120,HOLD_MIN_SECONDS=2,HOLD_MIN_SHARE=.1,HOLD_MIN_PLAYER_SHARE=.25;
const near=(a,b,r)=>Math.hypot(a.x-b.x,a.y-b.y)<=r&&!(Number.isFinite(a.z)&&Number.isFinite(b.z)&&Math.abs(a.z-b.z)>HOLD_FLOOR_Z);
function dwells(row,{startSeconds,endSeconds},minSeconds,skipSpawn){
  const {round,rate}=row,start=round.live+startSeconds*rate,end=Math.min(round.end,round.live+endSeconds*rate),fr=round.frames,open=new Map(),out=[];
  const key=`${row.entry.id}:${row.roundIndex}`,spawn=new Map();
  for(const f of fr){if(f.tick<round.live)continue;for(const p of f.players)if(p.team===row.side&&Number.isFinite(p.x)&&!spawn.has(String(p.id)))spawn.set(String(p.id),{x:p.x,y:p.y,z:Number.isFinite(p.z)?p.z:0});if(f.tick-round.live>rate)break;}
  const close=id=>{const d=open.get(id);open.delete(id);const c=d&&{x:d.sx/d.seconds,y:d.sy/d.seconds,z:d.sz/d.seconds};
    if(d&&d.seconds>=minSeconds&&!(skipSpawn&&spawn.has(id)&&near(c,spawn.get(id),HOLD_RADIUS)))out.push({x:d.sx/d.seconds,y:d.sy/d.seconds,z:d.sz/d.seconds,seconds:d.seconds,places:d.places,player:id,round:key});};
  const fresh=()=>({seconds:0,sx:0,sy:0,sz:0,places:new Map(),x1:Infinity,x2:-Infinity,y1:Infinity,y2:-Infinity,z1:Infinity,z2:-Infinity,away:0});
  const fits=(d,p,z)=>Math.max(d.x2,p.x)-Math.min(d.x1,p.x)<=HOLD_BOX&&Math.max(d.y2,p.y)-Math.min(d.y1,p.y)<=HOLD_BOX&&Math.max(d.z2,z)-Math.min(d.z1,z)<=HOLD_FLOOR_Z;
  const take=(d,p,z,s)=>{d.away=0;d.seconds+=s;d.sx+=p.x*s;d.sy+=p.y*s;d.sz+=z*s;d.x1=Math.min(d.x1,p.x);d.x2=Math.max(d.x2,p.x);d.y1=Math.min(d.y1,p.y);d.y2=Math.max(d.y2,p.y);d.z1=Math.min(d.z1,z);d.z2=Math.max(d.z2,z);
    const pl=p.place||'unknown';d.places.set(pl,(d.places.get(pl)??0)+s);};
  for(let i=0;i<fr.length;i++){
    const f=fr[i],a=Math.max(start,f.tick),b=Math.min(end,fr[i+1]?.tick??round.end,f.tick+rate*.5);
    if(b<=a)continue;const s=(b-a)/rate,seen=new Set();
    for(const p of f.players){
      if(p.team!==row.side||!alive(p)||!Number.isFinite(p.x)||!Number.isFinite(p.y))continue;
      const id=String(p.id),z=Number.isFinite(p.z)?p.z:0;seen.add(id);let d=open.get(id);
      if(d&&!fits(d,p,z)){d.away+=s;if(d.away<=HOLD_PEEK_SECONDS)continue;close(id);d=null;}
      if(!d){d=fresh();open.set(id,d);}
      take(d,p,z,s);
    }
    for(const id of [...open.keys()])if(!seen.has(id))close(id); // died or left the sample
  }
  for(const id of [...open.keys()])close(id);
  return out;
}
function holdSpots(rows,w,minSeconds,skipSpawn){
  const all=rows.flatMap(r=>dwells(r,w,minSeconds,skipSpawn)).sort((a,b)=>b.seconds-a.seconds);
  const add=(c,d)=>{c.seconds+=d.seconds;c.sx+=d.x*d.seconds;c.sy+=d.y*d.seconds;c.sz+=d.z*d.seconds;c.x=c.sx/c.seconds;c.y=c.sy/c.seconds;c.z=c.sz/c.seconds;};
  let clusters=[];
  for(const d of all){const c=clusters.filter(c=>near(d,c,HOLD_RADIUS)).sort((a,b)=>Math.hypot(a.x-d.x,a.y-d.y)-Math.hypot(b.x-d.x,b.y-d.y))[0];
    if(c)add(c,d);else{const n={seconds:0,sx:0,sy:0,sz:0};add(n,d);clusters.push(n);}}
  // One reassignment pass to the nearest final centre (greedy order otherwise drifts the borders).
  const centres=clusters.map(c=>({x:c.x,y:c.y,z:c.z,seconds:0,sx:0,sy:0,sz:0,rounds:new Set(),players:new Map(),places:new Map()}));
  for(const d of all){const c=centres.filter(c=>near(d,c,HOLD_RADIUS)).sort((a,b)=>Math.hypot(a.x-d.x,a.y-d.y)-Math.hypot(b.x-d.x,b.y-d.y))[0];if(!c)continue;
    add(c,d);c.rounds.add(d.round);if(!c.players.has(d.player))c.players.set(d.player,new Set());c.players.get(d.player).add(d.round);for(const [k,v] of d.places)c.places.set(k,(c.places.get(k)??0)+v);}
  return centres.filter(c=>c.rounds.size);
}

// Heatmap for one map, side and time window: the whole team (every round, stand-ins included) or one core player.
// mode 'holds' (default) lists the spots they stand still on and how often (share of rounds); 'all' shows all movement.
export function positionHeatmap(entries,refs,{window='0-20',player='',cellSize=128,mode='holds',minSeconds=HOLD_MIN_SECONDS,minShare=HOLD_MIN_SHARE,skipSpawn=true}={}){
  const w=WINDOWS.find(x=>x.id===window)??WINDOWS[0],rows=heatRows(entries,refs,player||null);
  const heat=aggregateHeatmap(rows,{startSeconds:w.startSeconds,endSeconds:w.endSeconds,cellSize});
  const rounds=player?new Set(rows.filter(r=>r.round.frames.some(f=>f.players.length)).map(r=>`${r.entry.id}:${r.roundIndex}`)).size:heat.rounds;
  const out={...heat,mode,window:w,player,rounds,sample:`${rounds} ${rounds===1?'round':'rounds'}`,places:placeSeconds(rows,w)};
  if(mode!=='holds')return out;
  // Rounds each player was alive in the window, for per-player shares.
  const played=new Map();for(const r of rows){const k=`${r.entry.id}:${r.roundIndex}`,start=r.round.live+w.startSeconds*r.rate,end=r.round.live+w.endSeconds*r.rate;
    for(const f of r.round.frames){if(f.tick<start||f.tick>end)continue;for(const p of f.players)if(p.team===r.side&&alive(p)){const id=String(p.id);if(!played.has(id))played.set(id,new Set());played.get(id).add(k);}}}
  const minRounds=rounds>=3?2:1,points=holdSpots(rows,w,minSeconds,skipSpawn).map(c=>{
      const holders=[...c.players].map(([id,set])=>({id,rounds:set.size,of:played.get(id)?.size??set.size,share:set.size/(played.get(id)?.size||set.size)})).sort((a,b)=>b.rounds-a.rounds||b.share-a.share);
      return {x:c.x,y:c.y,z:c.z,seconds:c.seconds,rounds:c.rounds.size,players:holders.length,holders,main:holders[0],
        place:[...c.places].sort((a,b)=>b[1]-a[1])[0]?.[0]??'unknown',share:rounds?c.rounds.size/rounds:0,avgSeconds:c.seconds/c.rounds.size};})
    .filter(p=>p.rounds>=minRounds&&(p.share>=minShare||p.holders.some(h=>h.rounds>=minRounds&&h.share>=HOLD_MIN_PLAYER_SHARE)))
    .sort((a,b)=>b.share-a.share||b.seconds-a.seconds).map((p,i)=>({...p,rank:i+1}));
  return {...out,points,max:Math.max(0,...points.map(p=>p.share))};
}

const top=(values)=>{const m=new Map();for(const v of values)if(v)m.set(v,(m.get(v)??0)+1);return [...m].sort((a,b)=>b[1]-a[1]||String(a[0]).localeCompare(String(b[0])));};

// One sampled snapshot per round: who stands where at the setup time, with AWP and zone.
function snapshots(entries,refs,mapDefs,detection){
  const get=ctx(entries),core=new Set(detection.core),out=[];
  for(const ref of refs){const c=get(ref);if(!c)continue;const {round,rate,entry}=c,def=mapDefs[ref.map];
    const roster=new Set((round.frames.find(f=>f.tick>=round.live)??round.frames[0])?.players.filter(p=>p.team===ref.side).map(p=>String(p.id))??[]);
    const frame=frameAt(round,round.live+SETUP_SECONDS[ref.side]*rate,rate);if(!frame)continue;
    const players=frame.players.filter(p=>p.team===ref.side&&alive(p)).map(p=>({id:String(p.id),core:core.has(String(p.id)),place:p.place||'unknown',zone:zoneOf(def,p),awp:isAwp(p),x:p.x,y:p.y}));
    if(!players.length)continue;
    // Rotation: zone at the setup time vs zone 5 s after the plant (or at 45 s without a plant).
    const plant=(round.events??[]).find(e=>e.event_name==='bomb_planted'&&e.tick>=round.live);
    const later=frameAt(round,plant?plant.tick+AFTER_PLANT_SECONDS*rate:round.live+ROTATION_SECONDS*rate,rate);
    const rotations=[];if(later&&later.tick<=round.end)for(const p of players){const q=later.players.find(x=>String(x.id)===p.id&&x.team===ref.side&&alive(x));if(q){const z=zoneOf(def,q);if(z!==p.zone)rotations.push({id:p.id,from:p.zone,to:z});}}
    out.push({...ref,number:round.number,source:entry.replay.source||ref.entryId,tick:frame.tick,roster,players,rotations,rotationChecked:Boolean(later&&later.tick<=round.end)});
  }
  return out;
}

// Setups, spots, player habits and AWP spots for one map and side. Per-player claims: core players only.
export function sideSetups(entries,refs,{mapDefs={},detection,names=new Map()}={}){
  const snaps=snapshots(entries,refs,mapDefs,detection),core=new Set(detection.core),n=snaps.length;
  const sample=(count,of=n)=>`${count} of ${of} rounds`;
  const evidence=s=>({entryId:s.entryId,roundIndex:s.roundIndex,number:s.number,source:s.source,tick:s.tick});
  // Usual spot of each core player on this side (most common callout at the setup time).
  const usual=new Map();
  for(const id of core){const seen=snaps.flatMap(s=>s.players.filter(p=>p.id===id).map(p=>({...p,snap:s})));if(!seen.length)continue;const [place,count]=top(seen.map(p=>p.place))[0];const [zone]=top(seen.filter(p=>p.place===place).map(p=>p.zone))[0];
    usual.set(id,{id,name:names.get(id)||id,place,zone,count,rounds:seen.length,sample:sample(count,seen.length),awp:seen.filter(p=>p.awp).length,evidence:seen.filter(p=>p.place===place).slice(0,10).map(p=>evidence(p.snap))});}
  // A stand-in standing on the usual spot of a core player who did not play that round fills that spot.
  const holder=(s,p)=>{if(p.core)return {label:names.get(p.id)||p.id,core:true};
    const missing=[...usual.values()].filter(u=>!s.roster.has(u.id)&&(u.place===p.place||u.zone===p.zone)).sort((a,b)=>Number(b.place===p.place)-Number(a.place===p.place))[0];
    return missing?{label:`filled by stand-in (usually ${missing.name})`,core:false,filledFor:missing.id}:{label:'stand-in',core:false};};
  const setups=new Map(),spots=new Map(),awp=new Map(),rot=new Map();let rotationRounds=0,rotationCount=0;
  for(const s of snaps){
    const zones={A:0,mid:0,B:0};for(const p of s.players)zones[p.zone]++;
    const label=setupLabel(zones);if(!setups.has(label))setups.set(label,{label,zones,players:0,count:0,evidence:[]});const g=setups.get(label);g.count++;g.players=s.players.length;g.evidence.push(evidence(s));
    for(const p of s.players){const key=`${p.zone}|${p.place}`;if(!spots.has(key))spots.set(key,{zone:p.zone,place:p.place,count:0,holders:new Map()});const sp=spots.get(key),h=holder(s,p).label;sp.count++;sp.holders.set(h,(sp.holders.get(h)??0)+1);
      if(p.awp){if(!awp.has(p.place))awp.set(p.place,{place:p.place,zone:p.zone,count:0,holders:new Map(),evidence:[]});const a=awp.get(p.place);a.count++;a.holders.set(h,(a.holders.get(h)??0)+1);if(a.evidence.length<10)a.evidence.push(evidence(s));}}
    if(s.rotationChecked){rotationRounds++;rotationCount+=s.rotations.length;for(const r of s.rotations){const k=`${r.from} → ${r.to}`;if(!rot.has(k))rot.set(k,{move:k,count:0,players:new Map()});const x=rot.get(k);x.count++;const who=core.has(r.id)?(names.get(r.id)||r.id):'stand-in';x.players.set(who,(x.players.get(who)??0)+1);}}
  }
  const holders=m=>[...m].sort((a,b)=>b[1]-a[1]).map(([label,count])=>({label,count}));
  const awpRounds=snaps.filter(s=>s.players.some(p=>p.awp)).length;
  return {rounds:n,setupSeconds:SETUP_SECONDS[refs[0]?.side]??null,
    setups:[...setups.values()].sort((a,b)=>b.count-a.count||a.label.localeCompare(b.label)).map(g=>({...g,share:n?g.count/n:0,sample:sample(g.count),evidence:g.evidence.slice(0,10)})),
    spots:[...spots.values()].sort((a,b)=>b.count-a.count||a.place.localeCompare(b.place)).map(s=>({...s,share:n?s.count/n:0,sample:sample(s.count),holders:holders(s.holders)})),
    players:[...usual.values()].sort((a,b)=>b.rounds-a.rounds||a.name.localeCompare(b.name)),
    awp:{rounds:awpRounds,sample:sample(awpRounds),spots:[...awp.values()].sort((a,b)=>b.count-a.count).map(a=>({...a,share:awpRounds?a.count/awpRounds:0,sample:`${a.count} of ${awpRounds} AWP rounds`,holders:holders(a.holders)}))},
    rotations:{rounds:rotationRounds,moves:rotationCount,perRound:rotationRounds?rotationCount/rotationRounds:0,list:[...rot.values()].sort((a,b)=>b.count-a.count).map(r=>({...r,players:holders(r.players)}))}};
}

// Everything for the positions section: per map, CT setups (side 3) and T defaults (side 2) after filters.
export function positionAnalysis(entries,detection,refs,{mapDefs={},buyRounds=[],filters={}}={}){
  const scores=roundScores(entries,detection),names=new Map(detection.players.filter(p=>p.core).map(p=>[p.id,p.name]));
  const kept=filterRounds(refs,filters,{buyRounds,scores}),maps=[...new Set(kept.map(r=>r.map))].sort();
  return {filters,rounds:kept.length,of:refs.length,maps:maps.map(map=>({map,sites:Boolean(Object.keys(mapDefs[map]?.sites??{}).length),
    ct:sideSetups(entries,kept.filter(r=>r.map===map&&r.side===3),{mapDefs,detection,names}),
    t:sideSetups(entries,kept.filter(r=>r.map===map&&r.side===2),{mapDefs,detection,names})})),
    warnings:[
      `Heuristic: setups sample living players ${SETUP_SECONDS[3]} s (CT) and ${SETUP_SECONDS[2]} s (T) after freeze end. Zone = the BombsiteA/BombsiteB callout; mid callouts (Middle, Outside, Canal, spawns ...) are always mid; else the nearest calibrated bombsite within 1400 units, else mid.`,
      `Heuristic: a rotation is a zone change between the setup sample and ${AFTER_PLANT_SECONDS} s after the plant (or ${ROTATION_SECONDS} s without a plant).`,
      'Team-level tables use every matched round, stand-ins included. Player rows and named holders are core players only; a stand-in on the usual spot of an absent core player is labelled "filled by stand-in".',
      'Callouts come from the game\'s last place name for each player. AWP = AWP held or carried at the setup sample.',
    ]};
}
