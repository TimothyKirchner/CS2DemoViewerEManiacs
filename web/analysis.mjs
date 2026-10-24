// Derived, offline heuristics. See ANALYSIS.md for definitions and limits.
export const BUY_LABELS = Object.freeze({pistol:'Pistol', 'full-buy':'Full buy', eco:'Eco', force:'Force', mixed:'Mixed / half buy', unknown:'Unknown'});
const normalize = s => String(s ?? '').toLowerCase().replace(/^weapon_/, '').replace(/[^a-z0-9]/g, '');
const RIFLES = new Set(['ak47','m4a1','m4a1s','m4a1silencer','m4a4','aug','sg553','sg556','galilar','galil','famas','awp','scar20','g3sg1']);
const PRIMARY = new Set([...RIFLES,'ssg08','scout','mac10','mp9','mp7','mp5sd','ump45','p90','bizon','ppbizon','nova','xm1014','mag7','sawedoff','m249','negev']);
const UTILITY = new Set(['smokegrenade','flashbang','hegrenade','highexplosivegrenade','molotov','incgrenade','incendiarygrenade']);
const alive = p => p.alive !== false && p.hp !== 0;
const sidePlayers = (frame,side) => (frame?.players ?? []).filter(p => p.team === side && alive(p));
const liveFrame = (round,tickRate=64) => {
  const f=round.frames.find(f=>f.tick>=round.live);
  return f&&f.tick-round.live<=tickRate*.5?f:undefined;
};
function equipment(p) {
  const items = (Array.isArray(p.inventory) ? p.inventory : []).map(normalize);
  // Active weapons are included, but a held knife must not hide the inventory.
  const held=normalize(p.weapon);if(!items.includes(held))items.push(held);
  return {rifle:items.some(n=>RIFLES.has(n)), primary:items.some(n=>PRIMARY.has(n)), utility:items.filter(n=>UTILITY.has(n)).length, armor:Number(p.armor)>0};
}
export function classifyTeam(round,side,{pistol=false,tickRate=64}={}) {
  const players=sidePlayers(liveFrame(round,tickRate),side), gear=players.map(equipment), n=players.length;
  const result={side,playerCount:n,rifles:gear.filter(g=>g.rifle).length,armored:gear.filter(g=>g.armor).length,utility:gear.reduce((s,g)=>s+g.utility,0),meanMoney:n?players.reduce((s,p)=>s+(Number(p.money)||0),0)/n:0};
  const set=(label,confidence,reason)=>({...result,label,confidence,reason});
  if(pistol)return set('pistol','high','Detected regulation half-opening round');
  if(n!==5)return set('unknown','low','A complete five-player live-start roster is unavailable');
  if(!players.every(p=>Array.isArray(p.inventory)&&p.inventory.length&&Number.isFinite(p.armor)&&Number.isFinite(p.money)))return set('unknown','low','Opening inventory, armor or balance is unavailable');
  if(result.rifles>=4&&result.armored>=4&&result.utility>=5)return set('full-buy','medium','At least four rifles, four armored players and five grenades');
  const primaries=gear.filter(g=>g.primary).length;
  if(primaries<=1&&result.armored<=1&&result.utility<=2)return set('eco','medium','Mostly pistols, with minimal armor and utility');
  if(result.meanMoney<=1200&&(primaries>=2||result.armored>=3))return set('force','low','Limited equipment with low remaining team bank; force inferred');
  return set('mixed','low','Partial equipment or preserved bank; half buy, bonus or mixed purchase');
}

// Integrate sampled occupancy over time instead of counting parser rows.
export function buildHeatmap(round,{tickRate=64,team=2,windowSeconds=Infinity,startSeconds=0,earlySeconds=30,earlyMultiplier=2,cellSize=128,maxGapSeconds=0.5}={}) {
  if(!(tickRate>0&&cellSize>0&&maxGapSeconds>0&&windowSeconds>=0&&startSeconds>=0&&earlySeconds>=0&&earlyMultiplier>=0))throw new RangeError('Invalid heatmap options');
  const start=round.live+startSeconds*tickRate,end=Math.min(round.end,start+windowSeconds*tickRate),earlyEnd=round.live+earlySeconds*tickRate,cells=new Map();
  const frames=round.frames;
  for(let i=0;i<frames.length;i++) {
    const f=frames[i],a=Math.max(start,f.tick),b=Math.min(end,frames[i+1]?.tick??round.end,f.tick+maxGapSeconds*tickRate);
    if(b<=a)continue;
    const seconds=(b-a)/tickRate,early=Math.max(0,Math.min(b,earlyEnd)-a)/tickRate;
    // After the opening, halve influence every 30 seconds. Integrating the
    // exponential keeps the result independent of parser sampling frequency.
    const decay=Math.LN2/30,lateA=Math.max(0,(a-earlyEnd)/tickRate),lateB=Math.max(0,(b-earlyEnd)/tickRate);
    const weight=early*earlyMultiplier+(Math.exp(-decay*lateA)-Math.exp(-decay*lateB))/decay;
    for(const p of sidePlayers(f,team)) {
      if(!Number.isFinite(p.x)||!Number.isFinite(p.y))continue;
      const cx=Math.floor(p.x/cellSize),cy=Math.floor(p.y/cellSize),key=`${cx},${cy}`;
      let c=cells.get(key);if(!c){c={x:(cx+.5)*cellSize,y:(cy+.5)*cellSize,weight:0,seconds:0,earlySeconds:0};cells.set(key,c);}
      c.seconds+=seconds;c.earlySeconds+=early;c.weight+=weight;
    }
  }
  const points=[...cells.values()];
  return {points,maxWeight:Math.max(0,...points.map(p=>p.weight)),totalSeconds:points.reduce((s,p)=>s+p.seconds,0),totalWeight:points.reduce((s,p)=>s+p.weight,0),color:team===2?'#f59e0b':'#3b82f6',team,cellSize};
}

function specials(round,map,tickRate,teams) {
  const found=new Map(), origins=new Map();
  for(const p of liveFrame(round,tickRate)?.players??[])origins.set(p.id,p);
  // A persistent 2-second formation avoids tagging a single incidental sample.
  const runs=new Map();
  for(const f of round.frames) {
    const t=(f.tick-round.live)/tickRate;if(t<5||t>30)continue;
    for(const side of [2,3]) {
      const ps=sidePlayers(f,side);if(ps.length<4)continue;
      const candidates=[];
      if(side===3&&Number.isFinite(map?.scale))for(const [site,xy] of Object.entries(map.sites??{})) {
        const sx=map.x+xy[0]*map.scale,sy=map.y-xy[1]*map.scale;
        const floor=map.siteFloors?.[site];
        const count=ps.filter(p=>Math.hypot(p.x-sx,p.y-sy)<=650&&(!map.lower||Number.isFinite(p.z)&&Number.isFinite(map.splitZ)&&(floor==='lower'?p.z<map.splitZ:floor==='upper'&&p.z>=map.splitZ))).length;
        if(count>=4)candidates.push({id:'site-stack',site,count});
      }
      let maxPush=0;
      for(const anchor of ps) {
        const group=ps.filter(p=>Math.hypot(p.x-anchor.x,p.y-anchor.y)<=450&&Math.abs((p.z??0)-(anchor.z??0))<=180);
        const movers=group.filter(p=>{const o=origins.get(p.id);return o&&Math.hypot(p.x-o.x,p.y-o.y)>=600;});
        maxPush=Math.max(maxPush,movers.length);
      }
      if(maxPush>=4)candidates.push({id:'group-push',site:null,count:maxPush});
      const active=new Set();
      for(const c of candidates) {
        const key=`${side}:${c.id}:${c.site??''}`;active.add(key);
        const prior=runs.get(key),run=prior&&f.tick-prior.last<=tickRate*.5?prior:{start:f.tick,last:f.tick};run.last=f.tick;runs.set(key,run);
        if(f.tick-run.start>=2*tickRate&&!found.has(key))found.set(key,{...c,side,teamKey:teams[side].teamKey,tick:run.start,label:c.id==='site-stack'?`${c.count}-player ${c.site} stack`:`${c.count}-player grouped push`});
      }
      for(const key of runs.keys())if(key.startsWith(`${side}:`)&&!active.has(key))runs.delete(key);
    }
  }
  return [...found.values()];
}
function signature(round,side,tickRate,team) {
  // Preserve opening/mid/late ordering; identical routes in reverse are distinct.
  const phases=[[0,15],[15,15],[30,30],[60,Infinity]],vector=new Map();
  const maps=phases.map(([startSeconds,windowSeconds])=>buildHeatmap(round,{tickRate,team:side,cellSize:512,startSeconds,windowSeconds}));
  const total=maps.reduce((s,h)=>s+h.totalWeight,0)||1;
  maps.forEach((h,i)=>{for(const p of h.points)vector.set(`pos:${i}:${p.x},${p.y}`,p.weight/total);});
  vector.set('rifles',team.rifles/5);vector.set('armor',team.armored/5);vector.set('utility',Math.min(team.utility,20)/20);
  return vector;
}
export function analyzeReplay(replay,{map}={}) {
  // Valve's Nuke overview explicitly identifies A upper and B lower. Other
  // custom/multi-floor maps can provide the same siteFloors metadata.
  if(replay.map==='de_nuke'&&map&&!map.siteFloors)map={...map,siteFloors:{A:'upper',B:'lower'}};
  const initial={2:new Set(),3:new Set()},tickRate=replay.tickRate??64;
  const first=replay.rounds.map(r=>liveFrame(r,tickRate)).find(f=>sidePlayers(f,2).length>=4&&sidePlayers(f,3).length>=4);
  for(const side of [2,3])for(const p of sidePlayers(first,side))initial[side].add(String(p.id));
  const identity=(round,side)=>{
    const ps=sidePlayers(liveFrame(round,tickRate),side),counts=[2,3].map(s=>ps.filter(p=>initial[s].has(String(p.id))).length);
    return Math.max(...counts)>=3&&counts[0]!==counts[1]?`team-${counts[0]>counts[1]?1:2}`:`side-${side}`;
  };
  const rounds=replay.rounds.map((r,roundIndex)=>{
    const teams={};for(const side of [2,3])teams[side]={...classifyTeam(r,side,{pistol:(replay.pistols??[]).includes(roundIndex),tickRate}),teamKey:identity(r,side)};
    return {roundIndex,number:r.number,teams,specials:specials(r,map,tickRate,teams)};
  });
  const groups=new Map();
  for(const r of rounds)for(const side of [2,3]) {
    const t=r.teams[side];if(!['full-buy','force'].includes(t.label))continue;
    // Keep sides separate: CT defaults and T attacks have different positional means.
    const key=`${t.teamKey}:${side}:${t.label}`;if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push({roundIndex:r.roundIndex,number:r.number,teamKey:t.teamKey,side,label:t.label,vector:signature(replay.rounds[r.roundIndex],side,tickRate,t)});
  }
  const representatives=[];
  for(const entries of groups.values()) {
    const mean=new Map();for(const e of entries)for(const [k,v] of e.vector)mean.set(k,(mean.get(k)??0)+v/entries.length);
    const scored=entries.map(({vector,...e})=>({...e,distance:[...mean].reduce((s,[k,v])=>s+((vector.get(k)??0)-v)**2,0),candidateCount:entries.length}));
    scored.sort((a,b)=>a.distance-b.distance||a.roundIndex-b.roundIndex);representatives.push(scored[0]);
  }
  const warnings=['Buy labels and special formations are heuristics; force-buy intent cannot be proven from equipment.','Heatmaps show sampled living-player time; gaps over 0.5 seconds are capped.'];
  if(!Object.keys(map?.sites??{}).length)warnings.push('Site-stack detection unavailable: this map has no calibrated site anchors.');
  else if(map.lower&&(!Number.isFinite(map.splitZ)||Object.keys(map.sites).some(s=>!['upper','lower'].includes(map.siteFloors?.[s]))))warnings.push('Some site stacks cannot be detected: multi-floor site heights are unavailable.');
  return {rounds,representatives,warnings};
}
