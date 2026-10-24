// Strat Scope: timeline normalization, independent of rendering and parser runtime.
export const EVENT_NAMES = ["round_start", "round_freeze_end", "round_end", "round_officially_ended", "round_announce_match_start", "round_announce_last_round_half", "smokegrenade_detonate", "smokegrenade_expired", "inferno_startburn", "inferno_expire", "inferno_extinguish", "flashbang_detonate", "hegrenade_detonate", "decoy_started", "decoy_detonate", "weapon_fire", "player_death", "player_blind", "bomb_planted", "bomb_defused", "bomb_exploded", "bomb_begindefuse", "bomb_abortdefuse", "bomb_dropped", "bomb_pickup"];
export const PLAYER_PROPS = ["X", "Y", "Z", "yaw", "health", "team_num", "weapon_name", "armor_value", "has_helmet", "has_defuser", "balance", "is_alive", "inventory", "flash_duration", "game_time"];
export function plain(v) {
  if (v instanceof Map) return Object.fromEntries([...v].map(([k,x]) => [k,plain(x)]));
  if (Array.isArray(v)) return v.map(plain);
  if (typeof v === "bigint") return v.toString();
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k,x]) => [k,plain(x)]));
  return v;
}
export function findRounds(events, rate=64) {
  const sorted = events.filter(e => Number.isFinite(e.tick)).sort((a,b) => a.tick-b.tick);
  const matchStarts = sorted.filter(e => e.event_name === "round_announce_match_start" && e.is_warmup_period !== true);
  const minTick = matchStarts.length ? matchStarts[matchStarts.length-1].tick : -Infinity;
  const freezes = sorted.filter(e => e.event_name === "round_freeze_end" && e.is_warmup_period !== true && e.tick >= minTick);
  const rounds = [];
  for (let i=0;i<freezes.length;i++) {
    const live = freezes[i], next = freezes[i+1]?.tick ?? Infinity;
    const end = sorted.find(e => e.event_name === "round_end" && e.is_warmup_period !== true && e.tick >= live.tick && e.tick < next);
    const start = sorted.filter(e => e.event_name === "round_start" && e.is_warmup_period !== true && e.tick <= live.tick && e.tick > (freezes[i-1]?.tick ?? minTick-1)).at(-1);
    const number = Number.isInteger(live.total_rounds_played) ? live.total_rounds_played+1 : i+1;
    const lastTick = sorted.at(-1)?.tick ?? live.tick;
    const r = {number, start:start?.tick ?? live.tick, live:live.tick, end:end?.tick ?? Math.min(lastTick,next-1), winner:end?.winner ?? null, reason:end?.message ?? "Incomplete round", incomplete:!end, frames:[], events:[], effects:[], grenades:[]};
    if(r.end <= r.live) continue;
    // A restart at the same score replaces the abandoned attempt.
    const previous = rounds.findIndex(x => x.number === number);
    if(previous >= 0) rounds.splice(previous);
    rounds.push(r);
  }
  return rounds;
}
export function wantedTicks(rounds, step=4) {
  const ticks = new Set();
  for(const r of rounds) {
    ticks.add(r.start); ticks.add(r.live); ticks.add(r.end);
    for(let t=Math.ceil(r.start/step)*step;t<=r.end;t+=step) ticks.add(t);
  }
  return new Int32Array([...ticks].sort((a,b)=>a-b));
}
export function detectPistols(rounds) {
  const first = rounds.findIndex(r => r.number === 1);
  if(first < 0) return [];
  const roster = r => new Map((r.frames.find(f=>f.tick>=r.live)?.players ?? r.frames[0]?.players ?? []).filter(p=>p.team===2||p.team===3).map(p=>[p.id,p.team]));
  const initial = roster(rounds[first]);
  for(let i=first+1;i<rounds.length;i++) {
    // Regulation side changes occur at R13 (MR12) or R16 (legacy MR15).
    if(![13,16].includes(rounds[i].number)) continue;
    const current = roster(rounds[i]); let common=0, flipped=0;
    for(const [id,side] of initial) if(current.has(id)){common++;if(current.get(id)!==side)flipped++;}
    if(common>=4 && flipped/common>=0.75) return [first,i];
  }
  return [first];
}
function grenadeType(s="") {
  const n=s.toLowerCase();
  if(n.includes("smoke"))return "smoke";
  if(n.includes("molotov")||n.includes("incendiary")||n.includes("inferno"))return "fire";
  if(n.includes("flash"))return "flash";
  if(n.includes("decoy"))return "decoy";
  return "he";
}
export function effectForPath(effects,path,rate=64) {
  const first=path.points[0],last=path.points.at(-1);
  if(!first||!last)return undefined;
  if(path.effectStart!==undefined)return effects.find(e=>e.type===path.type&&e.start===path.effectStart&&String(e.id)===String(path.effectId));
  // Fire is a new entity, so a Molotov projectile ID is not its inferno ID.
  if(path.type==="fire")return effects.filter(e=>e.type==="fire"&&String(e.thrower)===String(path.thrower)&&e.start>=first[0]&&Math.abs(e.start-(path.lastTick??last[0]))<=rate*.15&&Math.hypot(e.x-last[1],e.y-last[2],e.z-last[3])<96).sort((a,b)=>Math.abs(a.start-last[0])-Math.abs(b.start-last[0]))[0];
  return effects.find(e=>e.type===path.type&&String(e.id)===path.id&&e.start>=first[0]);
}
export function assemble(header, rawEvents, rawRows, rawGrenades, source="demo.dem") {
  const events=plain(rawEvents).sort((a,b)=>a.tick-b.tick);
  const rows=plain(rawRows).sort((a,b)=>a.tick-b.tick);
  const grenades=plain(rawGrenades).sort((a,b)=>a.tick-b.tick);
  let tickRate=64;
  const t0=rows.find(x=>Number.isFinite(x.game_time));
  const t1=t0 && rows.find(x=>x.tick>=t0.tick+64 && Number.isFinite(x.game_time) && x.game_time>t0.game_time);
  if(t0 && t1){const rate=(t1.tick-t0.tick)/(t1.game_time-t0.game_time);if(rate>=16&&rate<=256) tickRate=Math.round(rate);}
  const rounds=findRounds(events,tickRate), players=new Map(); let ri=0;
  const frameMaps=rounds.map(()=>new Map());
  for(const row of rows) {
    while(ri<rounds.length && row.tick>rounds[ri].end)ri++;
    if(ri>=rounds.length)break;
    const r=rounds[ri]; if(row.tick<r.start||![2,3].includes(row.team_num)||!Number.isFinite(row.X)||!Number.isFinite(row.Y))continue;
    const id=String(row.steamid ?? row.name); if(id==="0"||id==="undefined")continue;
    players.set(id,{id,name:row.name||id});
    let frame=frameMaps[ri].get(row.tick);if(!frame){frame={tick:row.tick,players:[]};frameMaps[ri].set(row.tick,frame);}
    frame.players.push({id,x:row.X,y:row.Y,z:row.Z??0,yaw:row.yaw??0,hp:row.health??0,team:row.team_num,alive:row.is_alive??row.health>0,weapon:row.weapon_name??"",armor:row.armor_value,hasHelmet:row.has_helmet,hasDefuser:row.has_defuser,money:row.balance,inventory:row.inventory,flash:row.flash_duration??0});
  }
  for(let i=0;i<rounds.length;i++) {
    const r=rounds[i];r.frames=[...frameMaps[i].values()];
    r.events=events.filter(e=>e.tick>=r.start&&e.tick<=r.end&&e.is_warmup_period!==true);
    const effects=[];
    const starts={smokegrenade_detonate:["smoke","smokegrenade_expired",20],inferno_startburn:["fire","inferno_expire",7],flashbang_detonate:["flash",null,0.8],hegrenade_detonate:["he",null,0.8],decoy_started:["decoy","decoy_detonate",15]};
    for(const e of r.events) {
      const spec=starts[e.event_name];if(!spec||!Number.isFinite(e.x)||!Number.isFinite(e.y))continue;
      const [type,expiry,seconds]=spec;
      const expire=expiry && events.find(x=>x.tick>e.tick&&x.tick<=r.end+tickRate*25&&(x.event_name===expiry||(type==="fire"&&x.event_name==="inferno_extinguish"))&&x.entityid===e.entityid);
      effects.push({type,start:e.tick,end:Math.min(expire?.tick??e.tick+seconds*tickRate,r.end),x:e.x,y:e.y,z:e.z??0,id:e.entityid,thrower:e.user_steamid??null,name:e.user_name??"Unknown",team:e.user_team_num??0,estimatedLifetime:Boolean(expiry&&!expire)});
    }
    r.effects=effects;
    const paths=new Map();
    for(const g of grenades){
      if(g.tick<r.start||g.tick>r.end||!Number.isFinite(g.x)||!Number.isFinite(g.y))continue;
      const key=String(g.grenade_entity_id ?? g.entity_id),type=grenadeType(g.grenade_type);
      let path=paths.get(key);
      if(!path||g.tick-path.lastTick>tickRate*2||path.type!==type){path={id:key,type,thrower:String(g.steamid??""),name:g.name??"Unknown",points:[],lastTick:g.tick};paths.set(key,path);r.grenades.push(path);}
      path.lastTick=g.tick;
      const last=path.points.at(-1);
      if(!last||g.tick-last[0]>=4)path.points.push([g.tick,g.x,g.y,g.z??0]);
    }
    for(const path of r.grenades){
      const first=path.points[0];
      const effect=effectForPath(r.effects,path,tickRate);
      if(effect){path.effectStart=effect.start;path.effectId=effect.id;}
      path.start=first[0];path.end=effect?.start??path.lastTick;
      path.points=path.points.filter(p=>p[0]<=path.end);
      if(effect&&path.points.length)path.points.push([effect.start,effect.x,effect.y,effect.z]);
      delete path.lastTick;
    }
    r.grenades=r.grenades.filter(p=>p.points.length>1&&p.end>p.start);
  }
  const valid=rounds.filter(r=>r.frames.length>0);
  if(!valid.length)throw new Error("No playable rounds with player positions were found. Use a complete CS2 match / GOTV demo.");
  const replay={version:1,source,map:plain(header).map_name??"unknown",tickRate,players:[...players.values()],rounds:valid,warnings:[]};
  replay.pistols=detectPistols(valid);
  if(valid[0].number!==1)replay.warnings.push("This recording does not contain round 1. Pistol strats is unavailable.");
  else if(replay.pistols.length<2)replay.warnings.push("A second pistol round was not found in this recording.");
  if(valid.some(r=>r.effects.some(e=>e.estimatedLifetime)))replay.warnings.push("Some utility expiry events are missing; those lifetimes use a fallback and are marked with ~.");
  return replay;
}
export function frameAt(round,tick) {
  const frames=round.frames;if(!frames.length)return [];
  let lo=0,hi=frames.length-1;
  while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(frames[mid].tick<=tick)lo=mid;else hi=mid-1;}
  const a=frames[lo],b=frames[lo+1];if(!b||tick<=a.tick)return a.players;
  const alpha=Math.min(1,(tick-a.tick)/(b.tick-a.tick)),other=new Map(b.players.map(p=>[p.id,p]));
  return a.players.map(p=>{const q=other.get(p.id);if(!q||p.alive!==q.alive||Math.hypot(p.x-q.x,p.y-q.y)>160)return p;const yaw=((q.yaw-p.yaw+540)%360)-180;return {...p,x:p.x+(q.x-p.x)*alpha,y:p.y+(q.y-p.y)*alpha,z:p.z+(q.z-p.z)*alpha,yaw:p.yaw+yaw*alpha};});
}
export function activeEffects(round,tick){return round.effects.filter(e=>e.start<=tick&&tick<e.end);}
export function formatLoadout(player={}){
  const items=(Array.isArray(player.inventory)?player.inventory:[]).map(item=>typeof item==="string"?item:(item?.name??item?.weapon_name??String(item??""))).filter(Boolean);
  const counts=new Map();for(const item of items){const label=String(item).replace(/^weapon_/i,"").replaceAll("_"," ");counts.set(label,(counts.get(label)??0)+1);}
  const normalized=[...counts.keys()];
  const active=String(player.weapon??"").replace(/^weapon_/i,"").replaceAll("_"," ");
  const equipmentKey=item=>item.toLowerCase().replace(/[^a-z0-9]/g,"");
  if(active&&!normalized.some(item=>equipmentKey(item)===equipmentKey(active)))normalized.unshift(active);
  const kit=player.hasDefuser||player.has_defuser?"Defuse kit":null;
  const armor=player.armor>0?(player.hasHelmet||player.has_helmet?"Kevlar + helmet":`${player.armor} armor`):null;
  return [...normalized.map(item=>counts.get(item)>1?`${item} ×${counts.get(item)}`:item),armor,kit].filter(Boolean);
}
export function visibleGunshots(events,tick,rate=64,windowSeconds=.11){
  const excluded=/(knife|bayonet|grenade|flashbang|smoke|molotov|incendiary|decoy|c4|healthshot|taser)/i;
  return events.filter(e=>e.event_name==="weapon_fire"&&e.tick<=tick&&e.tick>tick-rate*windowSeconds&&!excluded.test(String(e.weapon??e.weapon_name??"")));
}
export function worldToRadar(map,x,y){return [(x-map.x)/map.scale,(map.y-y)/map.scale];}
export function nextRoundIndex(replay,index,mode,loop){
  if(loop)return index;
  if(mode==="pistols"){const i=replay.pistols.indexOf(index);return i>=0&&i+1<replay.pistols.length?replay.pistols[i+1]:null;}
  return index+1<replay.rounds.length?index+1:null;
}
export function validateReplay(v){
  if(!v||v.version!==1||!Array.isArray(v.rounds)||!Array.isArray(v.players)||!Number.isFinite(v.tickRate)||v.tickRate<16||v.tickRate>256)throw new Error("This is not a supported Strat Scope replay.");
  for(const r of v.rounds){if(!Number.isFinite(r.start)||!Number.isFinite(r.live)||!Number.isFinite(r.end)||r.end<=r.start||!Array.isArray(r.frames)||!r.frames.length||!Array.isArray(r.events)||!Array.isArray(r.effects)||!Array.isArray(r.grenades))throw new Error("This replay has missing or invalid round data.");}
  v.pistols=detectPistols(v.rounds);v.warnings??=[];return v;
}
