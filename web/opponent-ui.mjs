import {detectOpponent,opponentRounds} from './opponent.mjs';
import {buyLibrary,BUY_TYPES} from './opponent-buys.mjs';
import {positionAnalysis,positionHeatmap,filterRounds,roundScores,WINDOWS,SCORE_STATES} from './opponent-positions.mjs';
import {escapeHtml as esc} from './scouting.mjs';

// "Analyse opponent" tab: target-team detection with Frank's overrides (stored by the app, saved in the session).
export function initOpponent(container,api){
  container.innerHTML=`<div class="scouting opponent"><h3>Analyse opponent</h3><p>Import the enemy team's demos. Players are matched by SteamID, never by name; the latest name is shown. Heuristic: a player in at least half of the included demos is core, and a demo belongs to the team when at least 3 of its players are core. Override below when this is wrong.</p>
  <div class="session-actions"><label for="demo-file" class="button primary">＋ Import enemy demos</label><button data-o="reset">Clear overrides</button></div>
  <p data-o="status" role="status"></p><div data-o="maps"></div>
  <h4>Buy-type round library</h4><div data-o="buys"></div>
  <h4>Positions and setups</h4><div data-o="pos-controls" class="scout-controls"></div><div class="scout-radar"><canvas data-o="radar" width="512" height="512" aria-label="Opponent position heatmap"></canvas><div data-o="places"></div></div><div data-o="positions"></div>
  <h4>Roster</h4><div data-o="roster"></div><h4>Demos</h4><div data-o="demos"></div></div>`;
  const el=name=>container.querySelector(`[data-o="${name}"]`);let detection=null;
  const table=(headers,rows)=>rows.length?`<div class="scout-table"><table><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`:'<p class="muted">None.</p>';
  const side=s=>s===2?'T':s===3?'CT':'?';let buyMap='';
  const pct=v=>v===null?'—':`${Math.round(v*100)}%`,num=v=>v>=10?Math.round(v):v.toFixed(1);
  function renderBuys(entries,d){
    if(!d.demos.length){el('buys').innerHTML='';return null;}
    const lib=buyLibrary(entries,opponentRounds(entries,d),{mapDefs:api.getMapDefs?.()??{}});
    if(!lib.maps.some(m=>m.map===buyMap))buyMap=lib.maps[0]?.map??'';const m=lib.maps.find(x=>x.map===buyMap);
    const pick=lib.maps.length>1?`<label>Map <select data-o="buy-map">${lib.maps.map(x=>`<option value="${esc(x.map)}" ${x.map===buyMap?'selected':''}>${esc(x.map)}</option>`).join('')}</select></label>`:'';
    const sides=m?m.sides.map(s=>`<h5>${side(s.side)} side: ${s.rounds} rounds</h5>${table(['Buy type','Sample','Win rate','Typical route','First contact','Utility / round','Representative'],s.types.map(t=>[esc(t.label),esc(t.sample),`${pct(t.winRate)}${t.decided?` (${t.wins} of ${t.decided})`:''}`,t.route?`${esc(t.route.name)} (${esc(t.route.sample)})`:'—',t.contactSeconds===null?'—':`${num(t.contactSeconds)} s median (${t.contactSample} rounds)`,`${['smoke','flash','fire','he'].map(k=>`${num(t.utility[k])} ${k==='fire'?'molly':k}`).join(', ')}`,t.representative?`<button class="scout-evidence" data-play="${esc(t.representative.entryId)}" data-round="${t.representative.roundIndex}" data-tick="${t.representative.tick}">▶ R${t.representative.number} · ${esc(t.representative.source)}</button>`:'—']))}`).join(''):'';
    el('buys').innerHTML=`${pick}${m&&!m.sites?'<p class="muted">This map has no calibrated bombsites: routes show as unknown.</p>':''}${sides}<p class="micro muted">${lib.warnings.map(esc).join('<br>')}</p>`;
    return lib;
  }
  // Positions: filters, radar heatmap (team or one core player) and setup tables for the chosen map and side.
  const pos={map:'',side:'3',buyType:'',score:'',window:'0-20',player:''};let drawRevision=0;
  const select=(name,label,options,value)=>`<label>${esc(label)} <select data-pos="${name}">${options.map(([v,t])=>`<option value="${esc(v)}" ${String(v)===String(value)?'selected':''}>${esc(t)}</option>`).join('')}</select></label>`;
  function drawHeat(heat,mapDef){
    const revision=++drawRevision,canvas=el('radar'),ctx=canvas.getContext('2d');ctx.clearRect(0,0,512,512);ctx.fillStyle='#141c29';ctx.fillRect(0,0,512,512);
    const paint=()=>{if(!mapDef?.scale){ctx.fillStyle='#d7dfeb';ctx.fillText('No calibrated radar for this map.',15,30);return;}
      for(const p of heat.points){ctx.fillStyle=`rgba(255,153,44,${.15+.75*p.seconds/(heat.max||1)})`;ctx.beginPath();ctx.arc((p.x-mapDef.x)/mapDef.scale/2,(mapDef.y-p.y)/mapDef.scale/2,Math.max(3,64/mapDef.scale),0,Math.PI*2);ctx.fill();}};
    if(mapDef?.image){const img=new Image();img.onload=()=>{if(revision!==drawRevision)return;ctx.drawImage(img,0,0,512,512);paint();};img.onerror=()=>{if(revision===drawRevision)paint();};img.src=mapDef.image;}else paint();
  }
  function renderPositions(entries,d,lib){
    if(!lib){for(const n of ['pos-controls','places','positions'])el(n).innerHTML='';drawHeat({points:[]},null);return;}
    const refs=opponentRounds(entries,d),maps=[...new Set(refs.map(r=>r.map))].sort();if(!maps.includes(pos.map))pos.map=maps[0]??'';
    if(!refs.some(r=>r.map===pos.map&&r.side===Number(pos.side)))pos.side=pos.side==='3'?'2':'3';
    const core=d.players.filter(p=>p.core);if(pos.player&&!core.some(p=>p.id===pos.player))pos.player='';
    el('pos-controls').innerHTML=[select('map','Map',maps.map(m=>[m,m]),pos.map),select('side','Side',[['3','CT'],['2','T']],pos.side),
      select('buyType','Buy type',[['','All buys'],...BUY_TYPES.filter(([t])=>t!=='unknown')],pos.buyType),select('score','Score',[['','Any score'],...SCORE_STATES],pos.score),
      select('window','Time',WINDOWS.map(w=>[w.id,w.label]),pos.window),select('player','Players',[['','Whole team (all rounds)'],...core.map(p=>[p.id,`${p.name} (core)`])],pos.player)].join('');
    const mapDefs=api.getMapDefs?.()??{},filters={map:pos.map,side:pos.side,buyType:pos.buyType,score:pos.score};
    const kept=filterRounds(refs,filters,{buyRounds:lib.rounds,scores:roundScores(entries,d)}),heat=positionHeatmap(entries,kept,{window:pos.window,player:pos.player});
    drawHeat(heat,mapDefs[pos.map]);
    el('places').innerHTML=`<p>${esc(heat.window.label)}, ${pos.player?esc(core.find(p=>p.id===pos.player)?.name??''):'whole team'}: ${esc(heat.sample)} of ${refs.filter(r=>r.map===pos.map&&r.side===Number(pos.side)).length}; ${heat.playerSeconds.toFixed(0)} player seconds.</p>${table(['Callout','Share of time'],heat.places.slice(0,10).map(x=>[esc(x.place),`${Math.round(x.share*100)}%`]))}`;
    const a=positionAnalysis(entries,d,refs,{mapDefs,buyRounds:lib.rounds,filters}),m=a.maps[0],s=m?(pos.side==='3'?m.ct:m.t):null;
    if(!s||!s.rounds){el('positions').innerHTML=`<p class="muted">No ${pos.side==='3'?'CT':'T'} rounds with position samples for these filters (${a.rounds} of ${a.of} rounds pass the filters).</p>`;return;}
    const who=list=>list.map(h=>`${esc(h.label)} ${h.count}`).join(', ');
    const play=e=>`<button class="scout-evidence" data-play="${esc(e.entryId)}" data-round="${e.roundIndex}" data-tick="${e.tick}">▶ R${e.number} · ${esc(e.source)}</button>`;
    el('positions').innerHTML=`<h5>${pos.side==='3'?'CT setups':'T default spots'} (${s.rounds} rounds, sampled at ${s.setupSeconds} s)</h5>
      ${table(['Setup','Rounds','Example'],s.setups.map(g=>[esc(g.label),`${Math.round(g.share*100)}% (${esc(g.sample)})`,play(g.evidence[0])]))}
      <h5>Who holds which spot</h5>${table(['Zone','Callout','Rounds','Held by'],s.spots.map(x=>[esc(x.zone),esc(x.place),`${Math.round(x.share*100)}% (${esc(x.sample)})`,who(x.holders)]))}
      <h5>Core players: usual spot</h5>${table(['Player','Callout','Zone','Rounds','AWP rounds'],s.players.map(p=>[esc(p.name),esc(p.place),esc(p.zone),esc(p.sample),String(p.awp)]))}
      <h5>AWP positions (${esc(s.awp.sample)})</h5>${table(['Callout','Zone','Rounds','Held by','Example'],s.awp.spots.map(x=>[esc(x.place),esc(x.zone),esc(x.sample),who(x.holders),play(x.evidence[0])]))}
      <h5>Rotations: ${s.rotations.moves} in ${s.rotations.rounds} rounds (${s.rotations.perRound.toFixed(1)} per round)</h5>${table(['Move','Count','Players'],s.rotations.list.map(r=>[esc(r.move),String(r.count),who(r.players)]))}
      <p class="micro muted">${a.warnings.map(esc).join('<br>')}</p>`;
  }
  function render(){
    const entries=api.getEntries(),overrides=api.getOpponent();detection=detectOpponent(entries,overrides);api.setDetection?.(detection);const d=detection;
    if(!entries.length){el('status').textContent='Import demos to begin.';for(const n of ['maps','buys','roster','demos'])el(n).innerHTML='';renderPositions(entries,d,null);return;}
    el('status').textContent=!d.demos.length?`No team found with at least ${d.minCore} core players in one demo (${d.total} included demos).`:`Target team: ${d.core.length} core players; ${d.demos.length} of ${d.total} included demos belong to the team.${d.excluded.length?` ${d.excluded.length} excluded.`:''}${d.ambiguous?' Ambiguous: two teams appear equally often. Mark one opponent player as core to choose the team.':''}`;
    el('maps').innerHTML=d.maps.length?`<p>${d.maps.map(m=>`<strong>${esc(m.map)}</strong>: ${m.demos} ${m.demos===1?'demo':'demos'} / ${m.rounds} rounds`).join(' · ')}</p>`:'';
    el('roster').innerHTML=table(['Player','Status','Demos','Rounds','Maps','Override'],d.players.map(p=>[esc(p.name),`${esc(p.description)}${p.override?' (manual)':''}`,`${p.demos} of ${d.demos.length}`,String(p.rounds),esc(p.maps.join(', ')),
      `<select data-player="${esc(p.id)}" aria-label="Override for ${esc(p.name)}"><option value="">Auto</option><option value="core" ${p.override==='core'?'selected':''}>Core</option><option value="stand-in" ${p.override==='stand-in'?'selected':''}>Stand-in</option></select>`]));
    renderPositions(entries,d,renderBuys(entries,d));
    const include=(id,on)=>`<input type="checkbox" data-include="${esc(id)}" ${on?'checked':''} aria-label="Include demo">`,open=(id,label)=>`<button class="scout-evidence" data-open="${esc(id)}">${esc(label)}</button>`;
    el('demos').innerHTML=table(['Include','Demo','Map','Date','Opponent','Core / stand-ins'],[
      ...d.demos.map(x=>[include(x.entryId,true),open(x.entryId,x.source),esc(x.map),esc(x.date||'—'),`${x.teamKey==='team-1'?'Team 1':'Team 2'}, started ${side(x.startSide)}`,`${x.coreCount} core / ${x.standIns.length} stand-in`]),
      ...d.unmatched.map(x=>[include(x.entryId,true),open(x.entryId,x.source),esc(x.map),esc(x.date||'—'),'Not matched',esc(x.reason)]),
      ...d.excluded.map(x=>[include(x.entryId,false),open(x.entryId,x.source),esc(x.map),'—','Excluded','—'])]);
  }
  function update(change){const o=api.getOpponent();change(o);api.setOpponent(o);render();}
  container.addEventListener('change',e=>{const t=e.target;
    if(t.dataset.player!==undefined)update(o=>{const id=t.dataset.player;o.core=o.core.filter(x=>x!==id);o.standIn=o.standIn.filter(x=>x!==id);if(t.value==='core')o.core.push(id);if(t.value==='stand-in')o.standIn.push(id);});
    if(t.dataset.o==='buy-map'){buyMap=t.value;render();}
    if(t.dataset.pos){pos[t.dataset.pos]=t.value;renderPositions(api.getEntries(),detection,buyLibrary(api.getEntries(),opponentRounds(api.getEntries(),detection),{mapDefs:api.getMapDefs?.()??{}}));}
    if(t.dataset.include!==undefined)update(o=>{const id=t.dataset.include;o.excluded=o.excluded.filter(x=>x!==id);if(!t.checked)o.excluded.push(id);});
  });
  container.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
    if(b.dataset.play){api.openRound(b.dataset.play,Number(b.dataset.round),Number(b.dataset.tick),true);return;}
    if(b.dataset.open){api.openRound(b.dataset.open,0,undefined,false);return;}
    if(b.dataset.o==='reset')update(o=>{o.core=[];o.standIn=[];o.excluded=[];});
  });
  return {refresh:render,getDetection:()=>detection};
}
