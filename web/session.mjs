import {validateReplay} from './core.mjs';
import {analyzeReplay} from './analysis.mjs';
import {normalizeOverrides} from './opponent.mjs';
const keys=new WeakMap();
export async function replayKey(r){if(keys.has(r))return keys.get(r);const bytes=new TextEncoder().encode(JSON.stringify([r.map,r.tickRate,r.rounds,r.players]));const key=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(n=>n.toString(16).padStart(2,'0')).join('');keys.set(r,key);return key;}
export function makeEntry(replay,metadata={}){validateReplay(replay);const teamNames=Object.fromEntries(['team-1','team-2'].map(k=>[k,String(metadata.teamNames?.[k]??'').trim().slice(0,100)])),date=typeof metadata.date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(metadata.date)?metadata.date:'';const voice=metadata.voice&&typeof metadata.voice.name==='string'?{name:metadata.voice.name.slice(0,255),offset:Number.isFinite(metadata.voice.offset)?metadata.voice.offset:0,volume:Number.isFinite(metadata.voice.volume)?Math.max(0,Math.min(1,metadata.voice.volume)):1}:null;return {id:metadata.id??globalThis.crypto.randomUUID(),replay,teamNames,date,voice};}
export function filterRounds(entries,filters={},maps={}){
  const out=[];
  for(const e of entries){
    if(filters.map&&e.replay.map!==filters.map||filters.from&&(!e.date||e.date<filters.from)||filters.to&&(!e.date||e.date>filters.to))continue;
    if(filters.player&&!e.replay.players.some(p=>p.id===filters.player))continue;
    const analysis=e.analysis??=analyzeReplay(e.replay,{map:maps[e.replay.map]});
    for(const a of analysis.rounds){const r=e.replay.rounds[a.roundIndex];
      if(filters.player&&!r.frames.some(f=>f.players.some(p=>p.id===filters.player)))continue;
      const sides=[2,3].filter(s=>!filters.side||s===Number(filters.side)).filter(s=>!filters.team||e.teamNames[a.teams[s].teamKey]===filters.team).filter(s=>!filters.buy||a.teams[s].label===filters.buy).filter(s=>!filters.result||(filters.result==='win'?r.winner===s:filters.result==='loss'?Boolean(r.winner)&&r.winner!==s:!r.winner));
      if(filters.player&&!sides.some(s=>r.frames.find(f=>f.tick>=r.live)?.players.some(p=>p.id===filters.player&&p.team===s)))continue;
      if(sides.length)out.push({entryId:e.id,roundIndex:a.roundIndex,number:r.number,map:e.replay.map,source:e.replay.source,sides});
    }
  }return out;
}
export function sessionBundle(entries,clips,opponent){return {type:'strat-scope-session',version:1,...(opponent?{opponent:normalizeOverrides(opponent)}:{}),entries:entries.map(({id,replay,teamNames,date,voice})=>({id,replay,teamNames,date,voice:voice?{name:voice.name,offset:voice.offset,volume:voice.volume}:null})),clips};}
export function readBundle(value){
  if(value?.type!=='strat-scope-session'||value.version!==1||!Array.isArray(value.entries)||!value.entries.length)throw new Error('Unsupported or empty session bundle.');
  const ids=new Set(),entries=value.entries.map(e=>{const entry=makeEntry(e.replay,e);if(typeof entry.id!=='string'||ids.has(entry.id))throw new Error('Session contains duplicate match IDs.');ids.add(entry.id);return entry;});
  const clips=(Array.isArray(value.clips)?value.clips:[]).filter(c=>{if(!c||!Number.isInteger(c.roundIndex))return false;const r=entries.find(e=>e.id===c.entryId)?.replay.rounds[c.roundIndex];return r&&Number.isFinite(c.start)&&Number.isFinite(c.end)&&c.start>=r.start&&c.end<=r.end&&c.end>c.start;}).map(c=>({entryId:c.entryId,roundIndex:c.roundIndex,start:c.start,end:c.end,title:String(c.title??'Clip').slice(0,200),tags:String(c.tags??'').slice(0,500),note:String(c.note??'').slice(0,2000)}));
  // Opponent overrides are optional; excluded demos that are not in this bundle are dropped.
  const opponent=normalizeOverrides(value.opponent);opponent.excluded=opponent.excluded.filter(id=>ids.has(id));
  return {entries,clips,opponent};
}
