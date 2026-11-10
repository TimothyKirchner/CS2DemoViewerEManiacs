// Opponent analyser, tendencies: opening duels by player and place, trades, stacks and retakes, utility
// landing clusters with timing, economy habits, clutch players and timeouts for the target team.
// Team-level numbers use every matched round (stand-ins included); per-player rows are core players only.
// Per-player openings, trades and clutches come from computeStatistics; places, clusters and stacks are heuristics.
import {computeStatistics} from './statistics.mjs';
import {zoneOf,roundScores,SETUP_SECONDS} from './opponent-positions.mjs';
import {siteOf,BUY_TYPE_LABELS} from './opponent-buys.mjs';

export const TRADE_SECONDS=5;
// CTs stack with >= 3 players on one site, Ts with >= 4 (sampled at the setup time).
export const STACK_PLAYERS=Object.freeze({2:4,3:3});
// Utility within this distance of a cluster centre joins the cluster (world units).
export const CLUSTER_RADIUS=Object.freeze({smoke:300,fire:300,flash:450,he:350});
export const UTILITY_TYPES=Object.freeze([['smoke','Smokes'],['fire','Mollies / incendiaries'],['flash','Flashes'],['he','HE grenades']]);
// A freeze time this much longer than the demo's usual freeze time counts as a timeout (or pause).
export const TIMEOUT_EXTRA_SECONDS=20;

const refKey=r=>`${r.entryId}:${r.roundIndex}`;
const alive=p=>p.alive!==false&&p.hp!==0;
const idOf=(e,prefix)=>{const x=e[`${prefix}_steamid`];return x==null||String(x)==='0'?null:String(x);};
const median=v=>{const s=v.filter(Number.isFinite).sort((a,b)=>a-b);if(!s.length)return null;const m=s.length>>1;return s.length%2?s[m]:(s[m-1]+s[m])/2;};
const quantile=(v,q)=>{const s=v.filter(Number.isFinite).sort((a,b)=>a-b);return s.length?s[Math.min(s.length-1,Math.floor(q*(s.length-1)+.5))]:null;};
const sample=(count,of,unit='rounds')=>`${count} of ${of} ${unit}`;
const share=(count,of)=>of?count/of:null;
const tally=values=>{const m=new Map();for(const v of values)if(v)m.set(v,(m.get(v)??0)+1);return [...m].sort((a,b)=>b[1]-a[1]||String(a[0]).localeCompare(String(b[0]))).map(([label,count])=>({label,count}));};
function frameAt(round,tick){let best=null;for(const f of round.frames){if(f.tick>tick)break;best=f;}return best??round.frames[0];}
const openingRoster=round=>(round.frames.find(f=>f.tick>=round.live)??round.frames[0])?.players??[];

function context(entries,detection){
  const byId=new Map(entries.map(e=>[e.id,e])),core=new Set(detection.core);
  const names=new Map(detection.players.filter(p=>p.core).map(p=>[p.id,p.name]));
  const who=id=>core.has(id)?(names.get(id)||id):'stand-in';
  return {core,names,who,get:ref=>{const entry=byId.get(ref.entryId),round=entry?.replay.rounds[ref.roundIndex];return round?{entry,round,rate:entry.replay.tickRate||64}:null;}};
}

// Enemy kills between freeze end and round end, in order, each victim once. Sides from the event, else the roster.
function enemyKills(round){
  const roster=new Map(openingRoster(round).map(p=>[String(p.id),p.team])),dead=new Set(),out=[];
  const side=(e,prefix)=>{const s=Number(e[`${prefix}_team_num`]);return [2,3].includes(s)?s:roster.get(idOf(e,prefix))??null;};
  for(const e of [...(round.events??[])].filter(e=>e.event_name==='player_death'&&e.tick>=round.live&&e.tick<=round.end).sort((a,b)=>a.tick-b.tick)){
    const victim=idOf(e,'user'),attacker=idOf(e,'attacker');if(!victim||dead.has(victim))continue;dead.add(victim);
    const vs=side(e,'user'),as=side(e,'attacker');
    if(attacker&&attacker!==victim&&vs&&as&&vs!==as)out.push({tick:e.tick,victim,attacker,victimSide:vs,attackerSide:as,event:e});
  }
  return out;
}
const placeOf=(round,tick,id,mapDef,fallback)=>{const p=frameAt(round,tick)?.players.find(x=>String(x.id)===id)??fallback;return {place:p?.place||'unknown',zone:p?zoneOf(mapDef,p):'mid'};};

// Opening duels and trades for one map and side.
export function duelTendencies(entries,detection,refs,{mapDefs={},tradeSeconds=TRADE_SECONDS}={}){
  const c=context(entries,detection),openings=[],places=new Map(),players=new Map(),pairs=new Map();
  let ownDeaths=0,traded=0,openingDeaths=0,openingTraded=0,enemyDeaths=0,enemyTraded=0;const tradeTimes=[],untraded=[];
  for(const ref of refs){const x=c.get(ref);if(!x)continue;const {round,rate,entry}=x,def=mapDefs[ref.map],kills=enemyKills(round);
    const won=round.incomplete||round.winner==null?null:Number(round.winner)===ref.side;
    const first=kills[0];
    if(first){const ownWon=first.attackerSide===ref.side,id=ownWon?first.attacker:first.victim,pre=ownWon?'attacker':'user';
      const spot=placeOf(round,first.tick,id,def,{x:first.event[`${pre}_X`],y:first.event[`${pre}_Y`]});
      const o={...ref,number:round.number,source:entry.replay.source||ref.entryId,tick:first.tick,seconds:(first.tick-round.live)/rate,ownWon,id,core:c.core.has(id),...spot,won};openings.push(o);
      const k=`${spot.zone}|${spot.place}`;if(!places.has(k))places.set(k,{zone:spot.zone,place:spot.place,count:0,wins:0,evidence:[]});const pl=places.get(k);pl.count++;if(ownWon)pl.wins++;if(pl.evidence.length<10)pl.evidence.push(o);
      if(o.core){if(!players.has(id))players.set(id,{id,name:c.who(id),attempts:0,wins:0,places:[]});const p=players.get(id);p.attempts++;if(ownWon)p.wins++;p.places.push(spot.place);}
    }
    // Trades: an own death is traded when a teammate kills the killer within the window.
    // Baseline: the same rule for their opponents in the same rounds.
    kills.forEach((k,i)=>{if(k.victimSide!==ref.side){
        if(kills.slice(i+1).some(n=>n.victim===k.attacker&&n.attackerSide!==ref.side&&n.tick-k.tick<=tradeSeconds*rate))enemyTraded++;enemyDeaths++;return;}
      ownDeaths++;if(i===0)openingDeaths++;
      const t=kills.slice(i+1).find(n=>n.victim===k.attacker&&n.attackerSide===ref.side&&n.tick-k.tick<=tradeSeconds*rate);
      if(!t){if(untraded.length<10)untraded.push({...ref,number:round.number,source:entry.replay.source||ref.entryId,tick:k.tick});return;}traded++;if(i===0)openingTraded++;tradeTimes.push((t.tick-k.tick)/rate);
      const pair=`${c.who(t.attacker)} for ${c.who(k.victim)}`;pairs.set(pair,(pairs.get(pair)??0)+1);});
  }
  const n=openings.length,wins=openings.filter(o=>o.ownWon).length,decided=o=>o.won!==null;
  const after=list=>({count:list.filter(decided).length,wins:list.filter(o=>o.won).length});
  const aw=after(openings.filter(o=>o.ownWon)),al=after(openings.filter(o=>!o.ownWon));
  return {rounds:refs.length,openings:{count:n,wins,winRate:share(wins,n),sample:sample(n,refs.length),medianSeconds:median(openings.map(o=>o.seconds)),
      standIn:openings.filter(o=>!o.core).length,afterWin:{...aw,winRate:share(aw.wins,aw.count)},afterLoss:{...al,winRate:share(al.wins,al.count)}},
    places:[...places.values()].sort((a,b)=>b.count-a.count||a.place.localeCompare(b.place)).map(p=>({...p,winRate:share(p.wins,p.count),sample:sample(p.count,n,'openings')})),
    players:[...players.values()].sort((a,b)=>b.attempts-a.attempts||a.name.localeCompare(b.name)).map(p=>({...p,winRate:share(p.wins,p.attempts),sample:sample(p.attempts,n,'openings'),places:tally(p.places).slice(0,3)})),
    trades:{deaths:ownDeaths,traded,share:share(traded,ownDeaths),baseline:{deaths:enemyDeaths,traded:enemyTraded,share:share(enemyTraded,enemyDeaths)},evidence:untraded,sample:sample(traded,ownDeaths,'deaths'),openingDeaths,openingTraded,openingShare:share(openingTraded,openingDeaths),
      medianSeconds:median(tradeTimes),seconds:tradeSeconds,pairs:[...pairs].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).map(([label,count])=>({label,count}))}};
}

// Stacks (both sides) and retakes (CT: site given up at the plant) for one map and side.
export function stackTendencies(entries,detection,refs,{mapDefs={}}={}){
  const c=context(entries,detection),stacks={A:0,B:0},stackEvidence=[];let sampled=0,plants=0,retakes=0,retakeWins=0,postPlantWins=0,decidedPlants=0;
  for(const ref of refs){const x=c.get(ref);if(!x)continue;const {round,rate,entry}=x,def=mapDefs[ref.map],side=ref.side;
    const tick=round.live+SETUP_SECONDS[side]*rate,frame=frameAt(round,tick);
    const own=frame&&Math.abs(frame.tick-tick)<=rate*.5?frame.players.filter(p=>p.team===side&&alive(p)):[];
    if(own.length){sampled++;const z={A:0,mid:0,B:0};for(const p of own)z[zoneOf(def,p)]++;
      const site=['A','B'].find(s=>z[s]>=STACK_PLAYERS[side]);if(site){stacks[site]++;if(stackEvidence.length<10)stackEvidence.push({...ref,number:round.number,source:entry.replay.source||ref.entryId,tick:frame.tick,site,players:z[site]});}}
    const plant=(round.events??[]).find(e=>e.event_name==='bomb_planted'&&e.tick>=round.live&&e.tick<=round.end);if(!plant)continue;
    plants++;const won=round.incomplete||round.winner==null?null:Number(round.winner)===side;if(won!==null){decidedPlants++;if(won)postPlantWins++;}
    if(side!==3)continue;
    // Retake: no living CT on the plant site when the bomb goes down.
    // Plant site: the planter's zone (bombsite callout, then site anchors), else the event position.
    const pf=frameAt(round,plant.tick),planter=pf?.players.find(p=>String(p.id)===idOf(plant,'user'));
    const pz=planter?zoneOf(def,planter):'mid',site=pz==='A'||pz==='B'?pz:siteOf(def,plant.user_X,plant.user_Y);
    const onSite=pf?.players.filter(p=>p.team===3&&alive(p)&&zoneOf(def,p)===site).length??0;
    if((site==='A'||site==='B')&&onSite===0){retakes++;if(won)retakeWins++;}
  }
  const stacked=stacks.A+stacks.B;
  return {rounds:refs.length,sampled,minPlayers:STACK_PLAYERS[refs[0]?.side]??null,stacks:{count:stacked,A:stacks.A,B:stacks.B,share:share(stacked,sampled),sample:sample(stacked,sampled),evidence:stackEvidence},
    plants:{count:plants,decided:decidedPlants,wins:postPlantWins,winRate:share(postPlantWins,decidedPlants),retakes,retakeWins,retakeShare:share(retakes,plants),retakeSample:sample(retakes,plants,'plants')}};
}

// Utility landing clusters per type: where the team's smokes, mollies, flashes and HEs land and when.
export function utilityClusters(entries,detection,refs,{radius=CLUSTER_RADIUS,minCount=2,limit=8}={}){
  const c=context(entries,detection),byType=Object.fromEntries(UTILITY_TYPES.map(([t])=>[t,[]]));
  for(const ref of refs){const x=c.get(ref);if(!x)continue;const {round,rate,entry}=x;
    const roster=new Set(openingRoster(round).filter(p=>p.team===ref.side).map(p=>String(p.id)));
    for(const fx of round.effects??[]){if(!byType[fx.type]||fx.start<round.live||fx.start>round.end)continue;
      if(!(fx.team===ref.side||(!fx.team&&roster.has(String(fx.thrower)))))continue;
      // Callout of the landing spot: nearest sampled player with a callout within 600 units.
      const f=frameAt(round,fx.start);let place='unknown',best=600;for(const p of f?.players??[]){const d=Math.hypot(p.x-fx.x,p.y-fx.y);if(p.place&&d<best){best=d;place=p.place;}}
      byType[fx.type].push({...ref,number:round.number,source:entry.replay.source||ref.entryId,tick:fx.start,x:fx.x,y:fx.y,seconds:(fx.start-round.live)/rate,thrower:c.who(String(fx.thrower??'')),place});}
  }
  const n=refs.length,out={};
  for(const [type] of UTILITY_TYPES){const clusters=[];
    for(const u of byType[type].sort((a,b)=>a.seconds-b.seconds)){let g=clusters.find(k=>Math.hypot(k.x-u.x,k.y-u.y)<=radius[type]);
      if(!g){g={x:u.x,y:u.y,items:[]};clusters.push(g);}g.items.push(u);g.x=g.items.reduce((s,i)=>s+i.x,0)/g.items.length;g.y=g.items.reduce((s,i)=>s+i.y,0)/g.items.length;}
    out[type]={thrown:byType[type].length,perRound:n?byType[type].length/n:0,clusters:clusters.filter(g=>g.items.length>=minCount).map(g=>{const rounds=new Set(g.items.map(refKey)).size,t=g.items.map(i=>i.seconds);
      return {type,x:Math.round(g.x),y:Math.round(g.y),count:g.items.length,rounds,share:share(rounds,n),sample:sample(rounds,n),place:tally(g.items.map(i=>i.place))[0]?.label??'unknown',
        medianSeconds:median(t),earlySeconds:quantile(t,.25),lateSeconds:quantile(t,.75),throwers:tally(g.items.map(i=>i.thrower)),evidence:g.items.slice(0,10).map(({x,y,...i})=>i)};})
      .sort((a,b)=>b.rounds-a.rounds||b.count-a.count).slice(0,limit)};}
  return {rounds:n,types:out};
}

const nextTypes=list=>{const t=tally(list.map(f=>f.type));return t.map(x=>({type:x.label,label:BUY_TYPE_LABELS[x.label]??x.label,count:x.count,share:x.count/list.length}));};
// Economy habits over all matched rounds: buys after pistols and losses, saves. `buyRounds` = buyLibrary(...).rounds.
export function economyHabits(buyRounds){
  const facts=new Map(buyRounds.map(f=>[refKey(f),f])),next=f=>{const g=facts.get(`${f.entryId}:${f.roundIndex+1}`);return g&&g.side===f.side&&g.type!=='pistol'?g:null;};
  const groups=[['lost-pistol-t','After a lost T pistol',f=>f.type==='pistol'&&f.side===2&&f.won===false],['lost-pistol-ct','After a lost CT pistol',f=>f.type==='pistol'&&f.side===3&&f.won===false],
    ['won-pistol','After a won pistol',f=>f.type==='pistol'&&f.won===true],['lost-buy','After a lost buy round (full, half, force)',f=>['full','half','force'].includes(f.type)&&f.won===false],
    ['lost-eco','After a lost eco',f=>f.type==='eco'&&f.won===false],['won-buy','After a won buy round',f=>['full','half','force','anti-eco'].includes(f.type)&&f.won===true]];
  const rows=groups.map(([id,label,test])=>{const list=buyRounds.filter(test).map(next).filter(Boolean),of=n=>list.filter(f=>f.type===n).length;
    return {id,label,count:list.length,next:nextTypes(list),force:of('force'),half:of('half'),eco:of('eco'),full:of('full'),forceShare:share(of('force')+of('half'),list.length),sample:`${list.length} ${list.length===1?'round':'rounds'}`};});
  const lost=buyRounds.filter(f=>f.won===false&&f.type!=='pistol'),saved=lost.filter(f=>f.survivors>=1),gun=buyRounds.filter(f=>f.type!=='pistol'&&f.type!=='unknown');
  const kind=t=>gun.filter(f=>f.type===t).length;
  return {rows,saves:{lost:lost.length,saved:saved.length,share:share(saved.length,lost.length),sample:sample(saved.length,lost.length,'lost rounds'),postPlant:buyRounds.filter(f=>f.postPlantSave).length,
      survivorsMedian:median(saved.map(f=>f.survivors))},
    buys:{rounds:gun.length,eco:kind('eco'),force:kind('force'),half:kind('half'),full:kind('full'),antiEco:kind('anti-eco'),forceShare:share(kind('force'),gun.length),ecoShare:share(kind('eco'),gun.length)}};
}

// Clutch players and per-player openings/trades from computeStatistics, restricted to the target side and core players.
export function playerTendencies(entries,detection,refs){
  if(!refs.length)return {players:[],team:{attempts:0,wins:0},coverage:null,warnings:[]};
  const stats=computeStatistics(entries,{roundRefs:refs.map(r=>({entryId:r.entryId,roundIndex:r.roundIndex,sides:[r.side]})),tradeWindowSeconds:TRADE_SECONDS});
  const core=new Set(detection.core),names=new Map(detection.players.map(p=>[p.id,p.name]));
  const players=stats.players.filter(p=>core.has(p.id)).map(p=>({id:p.id,name:names.get(p.id)||p.name,rounds:p.rounds,kills:p.kills,deaths:p.deaths,openingKills:p.openingKills,openingDeaths:p.openingDeaths,
    tradeKills:p.tradeKills,tradedDeaths:p.tradedDeaths,clutchAttempts:p.clutchAttempts,clutchWins:p.clutchWins,clutchRate:p.clutchAttempts?p.clutchWins/p.clutchAttempts:null}))
    .sort((a,b)=>(b.clutchWins??0)-(a.clutchWins??0)||(b.clutchAttempts??0)-(a.clutchAttempts??0)||a.name.localeCompare(b.name));
  const all=stats.players.filter(p=>p.clutchAttempts!=null),sum=k=>all.reduce((s,p)=>s+(p[k]??0),0);
  return {players,team:{attempts:sum('clutchAttempts'),wins:sum('clutchWins'),standInAttempts:all.filter(p=>!core.has(p.id)).reduce((s,p)=>s+p.clutchAttempts,0)},coverage:stats.coverage,warnings:stats.warnings};
}

// Timeouts: rounds whose freeze time runs TIMEOUT_EXTRA_SECONDS past the demo's median freeze time.
// The caller is not recorded; the team on a losing streak of 2+ is the likely caller (heuristic).
export function timeoutTendencies(entries,detection,{extraSeconds=TIMEOUT_EXTRA_SECONDS}={}){
  const scores=roundScores(entries,detection),list=[];let checked=0;
  for(const d of detection.demos){const entry=entries.find(e=>e.id===d.entryId);if(!entry)continue;const {rounds,tickRate=64,pistols=[]}=entry.replay,rate=tickRate||64;
    const freeze=rounds.map(r=>(r.live-r.start)/rate),normal=median(freeze.filter(s=>s>=0));if(normal===null)continue;let ownStreak=0,enemyStreak=0;
    rounds.forEach((r,i)=>{const side=d.sides[i];
      // Halftime and overtime switches (side change) and pistols can have long freeze times without a timeout.
      if(side&&!pistols.includes(i)&&d.sides[i-1]===side){checked++;
        if(freeze[i]>=normal+extraSeconds){const s=scores.get(`${d.entryId}:${i}`),won=r.incomplete||r.winner==null?null:Number(r.winner)===side;
          list.push({entryId:d.entryId,roundIndex:i,number:r.number,map:d.map,side,source:entry.replay.source||d.entryId,tick:r.live,freezeSeconds:freeze[i],normalSeconds:normal,
            own:s?.own??0,enemy:s?.enemy??0,ownStreak,enemyStreak,likely:ownStreak>=2?'target team':enemyStreak>=2?'other team':'unknown',won});}}
      const w=Number(r.winner);if(side&&[2,3].includes(w)){if(w===side){ownStreak=0;enemyStreak++;}else{enemyStreak=0;ownStreak++;}}
    });
  }
  // ownStreak counts rounds the target team lost in a row; enemyStreak rounds the other team lost.
  const own=list.filter(t=>t.likely==='target team'),decided=list.filter(t=>t.won!==null);
  return {checked,count:list.length,list,likelyOwn:own.length,ownAfterStreak:median(own.map(t=>t.ownStreak)),wins:decided.filter(t=>t.won).length,decided:decided.length,winRate:share(decided.filter(t=>t.won).length,decided.length),sample:sample(list.length,checked)};
}

// Everything for the tendencies section: per map and side, plus economy and timeouts over all matched rounds.
export function tendencyAnalysis(entries,detection,refs,{mapDefs={},buyRounds=[]}={}){
  const maps=[...new Set(refs.map(r=>r.map))].sort();
  const side=(map,s)=>{const r=refs.filter(x=>x.map===map&&x.side===s);return {rounds:r.length,duels:duelTendencies(entries,detection,r,{mapDefs}),stacks:stackTendencies(entries,detection,r,{mapDefs}),utility:utilityClusters(entries,detection,r),players:playerTendencies(entries,detection,r)};};
  return {rounds:refs.length,maps:maps.map(map=>({map,t:side(map,2),ct:side(map,3)})),economy:economyHabits(buyRounds),timeouts:timeoutTendencies(entries,detection),
    warnings:[
      `Team-level rows use every matched round, stand-ins included. Player rows are core players only; stand-in openings, trades and clutches count only in team totals.`,
      `Opening duel = first kill between the teams after freeze end; place = the target-team player's callout at that moment. A death is traded when a teammate kills the killer within ${TRADE_SECONDS} s.`,
      `Heuristic: stack = at least ${STACK_PLAYERS[3]} CTs (${STACK_PLAYERS[2]} Ts) on one bombsite at ${SETUP_SECONDS[3]} s (CT) / ${SETUP_SECONDS[2]} s (T). Site left empty = no living CT on the plant site when the bomb is planted.`,
      `Heuristic: utility clusters group landings within ${CLUSTER_RADIUS.smoke} units (smokes, mollies), ${CLUSTER_RADIUS.flash} (flashes) and ${CLUSTER_RADIUS.he} (HE); times are seconds after freeze end (median, 25-75 % range). Callout = nearest player callout within 600 units.`,
      'Heuristic: economy uses the buy types of the round library; "force %" counts force and half buys in the next round of the same half. Save = lost round with at least one player alive at the end.',
      `Heuristic: timeout = freeze time at least ${TIMEOUT_EXTRA_SECONDS} s longer than the demo's median (pauses look the same). The caller is not recorded: the team on a losing streak of 2+ is the likely caller.`,
      'Clutches (1vX) need complete broadcast rounds; other rounds do not count.',
    ]};
}
