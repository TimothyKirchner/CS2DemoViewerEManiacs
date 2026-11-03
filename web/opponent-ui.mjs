import {detectOpponent,opponentRounds} from './opponent.mjs';
import {buyLibrary} from './opponent-buys.mjs';
import {escapeHtml as esc} from './scouting.mjs';

// "Analyse opponent" tab: target-team detection with Frank's overrides (stored by the app, saved in the session).
export function initOpponent(container,api){
  container.innerHTML=`<div class="scouting opponent"><h3>Analyse opponent</h3><p>Import the enemy team's demos. Players are matched by SteamID, never by name; the latest name is shown. Heuristic: a player in at least half of the included demos is core, and a demo belongs to the team when at least 3 of its players are core. Override below when this is wrong.</p>
  <div class="session-actions"><label for="demo-file" class="button primary">＋ Import enemy demos</label><button data-o="reset">Clear overrides</button></div>
  <p data-o="status" role="status"></p><div data-o="maps"></div>
  <h4>Buy-type round library</h4><div data-o="buys"></div>
  <h4>Roster</h4><div data-o="roster"></div><h4>Demos</h4><div data-o="demos"></div></div>`;
  const el=name=>container.querySelector(`[data-o="${name}"]`);let detection=null;
  const table=(headers,rows)=>rows.length?`<div class="scout-table"><table><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`:'<p class="muted">None.</p>';
  const side=s=>s===2?'T':s===3?'CT':'?';let buyMap='';
  const pct=v=>v===null?'—':`${Math.round(v*100)}%`,num=v=>v>=10?Math.round(v):v.toFixed(1);
  function renderBuys(entries,d){
    if(!d.demos.length){el('buys').innerHTML='';return;}
    const lib=buyLibrary(entries,opponentRounds(entries,d),{mapDefs:api.getMapDefs?.()??{}});
    if(!lib.maps.some(m=>m.map===buyMap))buyMap=lib.maps[0]?.map??'';const m=lib.maps.find(x=>x.map===buyMap);
    const pick=lib.maps.length>1?`<label>Map <select data-o="buy-map">${lib.maps.map(x=>`<option value="${esc(x.map)}" ${x.map===buyMap?'selected':''}>${esc(x.map)}</option>`).join('')}</select></label>`:'';
    const sides=m?m.sides.map(s=>`<h5>${side(s.side)} side: ${s.rounds} rounds</h5>${table(['Buy type','Sample','Win rate','Typical route','First contact','Utility / round','Representative'],s.types.map(t=>[esc(t.label),esc(t.sample),`${pct(t.winRate)}${t.decided?` (${t.wins} of ${t.decided})`:''}`,t.route?`${esc(t.route.name)} (${esc(t.route.sample)})`:'—',t.contactSeconds===null?'—':`${num(t.contactSeconds)} s median (${t.contactSample} rounds)`,`${['smoke','flash','fire','he'].map(k=>`${num(t.utility[k])} ${k==='fire'?'molly':k}`).join(', ')}`,t.representative?`<button class="scout-evidence" data-play="${esc(t.representative.entryId)}" data-round="${t.representative.roundIndex}" data-tick="${t.representative.tick}">▶ R${t.representative.number} · ${esc(t.representative.source)}</button>`:'—']))}`).join(''):'';
    el('buys').innerHTML=`${pick}${m&&!m.sites?'<p class="muted">This map has no calibrated bombsites: routes show as unknown.</p>':''}${sides}<p class="micro muted">${lib.warnings.map(esc).join('<br>')}</p>`;
  }
  function render(){
    const entries=api.getEntries(),overrides=api.getOpponent();detection=detectOpponent(entries,overrides);api.setDetection?.(detection);const d=detection;
    if(!entries.length){el('status').textContent='Import demos to begin.';for(const n of ['maps','buys','roster','demos'])el(n).innerHTML='';return;}
    el('status').textContent=!d.demos.length?`No team found with at least ${d.minCore} core players in one demo (${d.total} included demos).`:`Target team: ${d.core.length} core players; ${d.demos.length} of ${d.total} included demos belong to the team.${d.excluded.length?` ${d.excluded.length} excluded.`:''}${d.ambiguous?' Ambiguous: two teams appear equally often. Mark one opponent player as core to choose the team.':''}`;
    el('maps').innerHTML=d.maps.length?`<p>${d.maps.map(m=>`<strong>${esc(m.map)}</strong>: ${m.demos} ${m.demos===1?'demo':'demos'} / ${m.rounds} rounds`).join(' · ')}</p>`:'';
    el('roster').innerHTML=table(['Player','Status','Demos','Rounds','Maps','Override'],d.players.map(p=>[esc(p.name),`${esc(p.description)}${p.override?' (manual)':''}`,`${p.demos} of ${d.demos.length}`,String(p.rounds),esc(p.maps.join(', ')),
      `<select data-player="${esc(p.id)}" aria-label="Override for ${esc(p.name)}"><option value="">Auto</option><option value="core" ${p.override==='core'?'selected':''}>Core</option><option value="stand-in" ${p.override==='stand-in'?'selected':''}>Stand-in</option></select>`]));
    renderBuys(entries,d);
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
    if(t.dataset.include!==undefined)update(o=>{const id=t.dataset.include;o.excluded=o.excluded.filter(x=>x!==id);if(!t.checked)o.excluded.push(id);});
  });
  container.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
    if(b.dataset.play){api.openRound(b.dataset.play,Number(b.dataset.round),Number(b.dataset.tick),true);return;}
    if(b.dataset.open){api.openRound(b.dataset.open,0,undefined,false);return;}
    if(b.dataset.o==='reset')update(o=>{o.core=[];o.standIn=[];o.excluded=[];});
  });
  return {refresh:render,getDetection:()=>detection};
}
