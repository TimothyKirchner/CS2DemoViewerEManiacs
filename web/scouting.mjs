// Local evidence summaries. Spatial patterns and role hints are explicitly heuristic.
const cache=new WeakMap();
const live=p=>p.alive!==false&&p.hp!==0&&Number.isFinite(p.x)&&Number.isFinite(p.y);
const cell=(p,size=512)=>`${Math.floor(p.x/size)},${Math.floor(p.y/size)}`;
const floorOf=(p,map)=>map?.lower&&Number.isFinite(map.splitZ)?(Number.isFinite(p.z)?p.z<map.splitZ?'lower':'upper':'unknown'):'single';
export function indexReplay(replay){
  if(cache.has(replay))return cache.get(replay);
  const initial={2:new Set(),3:new Set()},rate=replay.tickRate||64;
  const opening=r=>r.frames.find(f=>f.tick>=r.live&&f.tick-r.live<=rate*.5);
  const first=replay.rounds.map(opening).find(f=>[2,3].every(side=>(f?.players??[]).filter(p=>p.team===side).length>=3));
  for(const p of first?.players??[])if(initial[p.team])initial[p.team].add(String(p.id));
  const indexed=replay.rounds.map((round,roundIndex)=>{
    const teams={};
    for(const side of [2,3]){
      const roster=(opening(round)?.players??[]).filter(p=>p.team===side),counts=[2,3].map(s=>roster.filter(p=>initial[s].has(String(p.id))).length);
      teams[side]=Math.max(...counts)>=3&&counts[0]!==counts[1]?`team-${counts[0]>counts[1]?1:2}`:`side-${side}`;
    }
    return {round,roundIndex,teams};
  });cache.set(replay,indexed);return indexed;
}
export function teamIdentity(entry,key){
  const name=entry.teamNames?.[key]?.trim();
  return name?{id:name.toLocaleLowerCase(),name}:{id:`${entry.id}:${key}`,name:`${entry.replay.source||entry.id} / ${key} (unnamed)`};
}
export function scoutingRows(entries,filters={}){
  const selected=filters.roundRefs?new Map(filters.roundRefs.map(r=>[`${r.entryId}:${r.roundIndex}`,r])):null,rows=[];
  for(const entry of entries){
    if(filters.map&&entry.replay.map!==filters.map)continue;
    for(const indexed of indexReplay(entry.replay)){
      if(selected&&!selected.has(`${entry.id}:${indexed.roundIndex}`))continue;
      for(const side of [2,3]){
        const allowedSides=selected?.get(`${entry.id}:${indexed.roundIndex}`)?.sides;
        if(Array.isArray(allowedSides)&&!allowedSides.map(Number).includes(side))continue;
        const team=teamIdentity(entry,indexed.teams[side]);
        if(filters.side&&side!==Number(filters.side)||filters.team&&team.id!==filters.team)continue;
        rows.push({...indexed,entry,side,team,map:entry.replay.map,rate:entry.replay.tickRate||64,evidence:{entryId:entry.id,roundIndex:indexed.roundIndex,tick:indexed.round.live,number:indexed.round.number,source:entry.replay.source||entry.id}});
      }
    }
  }return rows;
}
function intervals(row,options,visit){
  const {round,rate}=row,start=round.live+(options.startSeconds??0)*rate,end=Math.min(round.end,round.live+(options.endSeconds??30)*rate),frames=round.frames;
  for(let i=0;i<frames.length;i++){
    const f=frames[i],a=Math.max(start,f.tick),b=Math.min(end,frames[i+1]?.tick??round.end,f.tick+rate*.5);
    if(b<=a)continue;
    for(const p of f.players)if(p.team===row.side&&live(p)&&(!options.floor||options.floor==='all'||floorOf(p,options.mapDef)===options.floor))visit(p,(b-a)/rate,a);
  }
}
export function aggregateHeatmap(rows,options={}){
  if(new Set(rows.map(r=>r.map)).size>1)throw new Error('Select one map before combining coordinates.');
  const size=options.cellSize??128,cells=new Map();
  if(!(size>0))throw new RangeError('Cell size must be positive.');
  for(const row of rows)intervals(row,options,(p,seconds)=>{
    const key=cell(p,size);if(!cells.has(key))cells.set(key,{x:(Math.floor(p.x/size)+.5)*size,y:(Math.floor(p.y/size)+.5)*size,seconds:0});cells.get(key).seconds+=seconds;
  });
  const points=[...cells.values()];return {points,max:Math.max(0,...points.map(p=>p.seconds)),playerSeconds:points.reduce((s,p)=>s+p.seconds,0),rounds:new Set(rows.map(r=>`${r.entry.id}:${r.roundIndex}`)).size};
}
export function queryArea(rows,rectangle,options={}){
  if(!['x1','x2','y1','y2'].every(k=>Number.isFinite(rectangle[k])))throw new Error('Enter four finite world coordinates.');
  const x1=Math.min(rectangle.x1,rectangle.x2),x2=Math.max(rectangle.x1,rectangle.x2),y1=Math.min(rectangle.y1,rectangle.y2),y2=Math.max(rectangle.y1,rectangle.y2),hits=[];
  for(const row of rows){let seconds=0,tick=null;const players=new Set();intervals(row,options,(p,d,t)=>{if(p.x>=x1&&p.x<=x2&&p.y>=y1&&p.y<=y2){seconds+=d;tick??=t;players.add(String(p.id));}});if(seconds)hits.push({...row.evidence,tick,team:row.team.name,side:row.side,playerSeconds:seconds,players:players.size});}
  return hits;
}
function sampledFrame(row,seconds){const tick=row.round.live+seconds*row.rate;let best;for(const f of row.round.frames){if(f.tick>tick)break;best=f;}return best&&tick-best.tick<=row.rate*.5?best:null;}
export function clusterPatterns(rows,{mapDefs={},floor='all',startSeconds=0,endSeconds=30}={}){
  const groups=new Map();
  for(const row of rows){
    const def=mapDefs[row.map],allowed=p=>p.team===row.side&&live(p)&&(floor==='all'||floorOf(p,def)===floor);
    const phases=[startSeconds,(startSeconds+endSeconds)/2,endSeconds].map(t=>{const ps=(sampledFrame(row,t)?.players??[]).filter(allowed);return ps.length?ps.map(p=>`${floorOf(p,def)}:${cell(p)}`).sort().join(';'):'missing';});
    if(phases.some(p=>p==='missing'))continue;
    const utility=row.round.effects.filter(e=>e.team===row.side&&(e.start-row.round.live)/row.rate>=startSeconds&&(e.start-row.round.live)/row.rate<=endSeconds&&(floor==='all'||floorOf(e,def)===floor)).sort((a,b)=>a.start-b.start).map(e=>`${e.type}@${Math.floor((e.start-row.round.live)/row.rate/5)}:${floorOf(e,def)}:${cell(e)}`);
    for(const [kind,signature] of [['opening',phases[0]],['path',phases.join(' → ')],['utility',utility.join(' → ')]]){
      if(!signature)continue;const key=JSON.stringify([row.map,row.team.id,row.side,kind,signature]);
      if(!groups.has(key))groups.set(key,{kind,map:row.map,team:row.team.name,side:row.side,signature,evidence:[],count:0});
      const g=groups.get(key);g.count++;g.evidence.push({...row.evidence,tick:row.round.live+startSeconds*row.rate});
    }
  }
  return [...groups.values()].filter(g=>g.count>=2).sort((a,b)=>b.count-a.count||a.kind.localeCompare(b.kind));
}
export function roleProfiles(rows){
  const profiles=new Map();
  for(const row of rows){
    const openingFrame=row.round.frames.find(f=>f.tick>=row.round.live&&f.tick-row.round.live<=row.rate*.5);if(!openingFrame)continue;
    const positionFrame=sampledFrame(row,10);
    const deaths=row.round.events.filter(e=>e.event_name==='player_death'&&e.tick>=row.round.live).sort((a,b)=>a.tick-b.tick),opening=deaths[0];
    for(const p of openingFrame.players.filter(p=>p.team===row.side&&live(p))){
      const key=JSON.stringify([row.map,row.team.id,String(p.id),row.side]);
      if(!profiles.has(key))profiles.set(key,{map:row.map,team:row.team.name,side:row.side,id:String(p.id),name:row.entry.replay.players?.find(q=>String(q.id)===String(p.id))?.name||String(p.id),observations:0,positionObservations:0,awp:0,openingContacts:0,positions:new Map(),evidence:[]});
      const r=profiles.get(key);r.observations++;if([p.weapon,...(p.inventory??[])].some(w=>/^(weapon_)?awp$/i.test(String(w))))r.awp++;
      if(opening&&[opening.attacker_steamid,opening.user_steamid].some(id=>id!=null&&String(id)===String(p.id)))r.openingContacts++;
      const atTen=positionFrame?.players.find(q=>String(q.id)===String(p.id)&&q.team===row.side&&live(q));
      if(atTen){const position=cell(atTen);r.positions.set(position,(r.positions.get(position)??0)+1);r.positionObservations++;}r.evidence.push({...row.evidence,tick:openingFrame.tick});
    }
  }
  return [...profiles.values()].map(p=>{const top=[...p.positions].sort((a,b)=>b[1]-a[1])[0];return {...p,positions:undefined,commonCell:top?.[0],positionShare:top?top[1]/p.positionObservations:0,confidence:p.observations<5?'insufficient':p.observations<15?'limited':'moderate',hint:p.observations<5?'Insufficient observations':p.awp/p.observations>=.4?'Frequent AWP equipment':p.openingContacts/p.observations>=.3?'Frequent opening contact':p.positionObservations<5?'Insufficient positional observations':top?.[1]/p.positionObservations>=.6?'Consistent opening position':'Varied opening positions'};}).sort((a,b)=>b.observations-a.observations);
}
export function mapResults(rows){
  const groups=new Map();for(const row of rows){const key=JSON.stringify([row.map,row.team.id]);if(!groups.has(key))groups.set(key,{map:row.map,team:row.team.name,rounds:0,wins:0,unknown:0,matches:new Set()});const g=groups.get(key);g.rounds++;g.matches.add(row.entry.id);if(![2,3].includes(Number(row.round.winner)))g.unknown++;else if(Number(row.round.winner)===row.side)g.wins++;}
  return [...groups.values()].map(g=>({...g,matches:g.matches.size,decided:g.rounds-g.unknown,winRate:g.rounds>g.unknown?g.wins/(g.rounds-g.unknown):null}));
}
export function simulateVeto(pool,steps){
  const remaining=[...new Set(pool.map(m=>m.trim()).filter(Boolean))],picks=[],history=[];
  for(const step of steps){if(!['ban','pick'].includes(step.action)||!remaining.includes(step.map))throw new Error(`Invalid ${step.action} of ${step.map}: map unavailable.`);remaining.splice(remaining.indexOf(step.map),1);history.push({...step});if(step.action==='pick')picks.push(step.map);}
  return {remaining,picks,history,decider:remaining.length===1?remaining[0]:null};
}
export const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// `sections`: extra pre-rendered parts such as the anti-strat page ({markdown, html} from renderAntiStrat).
export function prepReport({title='Local opponent prep',notes='',rows=[],patterns=[],profiles=[],results=[],tags=[],sections=[]},format='markdown'){
  const extra=sections.map(x=>format==='html'?x.html:x.markdown).filter(Boolean);
  const evidence=rows.map(r=>r.evidence),lines=[title,'',notes,'','Session evidence only. Team names are user assigned. Patterns and role hints are coarse heuristics, not inferred intent or predictions.','',`Scope: ${new Set(evidence.map(e=>e.entryId)).size} matches; ${new Set(evidence.map(e=>`${e.entryId}:${e.roundIndex}`)).size} rounds.`,'','Map results',...results.map(r=>`${r.team} / ${r.map}: ${r.wins}/${r.decided} decided rounds won, ${r.unknown} unknown, ${r.matches} matches.`),'','Recurring patterns',...patterns.map(p=>`${p.team} ${p.map} ${p.side===2?'T':'CT'} ${p.kind}: ${p.count} samples. Evidence: ${p.evidence.map(e=>`${e.source} [${e.entryId}] R${e.number} (roundIndex ${e.roundIndex}, tick ${e.tick})`).join('; ')}`),'','Observed role hints',...profiles.map(p=>`${p.name} / ${p.team} / ${p.map} / ${p.side===2?'T':'CT'}: ${p.hint}; ${p.observations} observations (${p.confidence}); AWP ${p.awp}; opening contacts ${p.openingContacts}; common 512-unit cell ${p.commonCell}.`),'','Editable tactic tags',...tags.map(t=>String(t)),'','Round references',...evidence.map(e=>`${e.source} [session match ${e.entryId}], round ${e.number}, roundIndex ${e.roundIndex}, tick ${e.tick}`)];
  return format==='html'?`<!doctype html><html lang="en"><meta charset="utf-8"><title>${escapeHtml(title)}</title><body><h1>${escapeHtml(title)}</h1><pre style="white-space:pre-wrap;font:16px system-ui">${escapeHtml(lines.slice(1).join('\n'))}</pre>${extra.join('')}</body></html>`:[...lines,...extra.map(x=>`\n${x}`)].join('\n');
}
