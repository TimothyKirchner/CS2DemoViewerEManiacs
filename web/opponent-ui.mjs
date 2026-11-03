import {detectOpponent} from './opponent.mjs';
import {escapeHtml as esc} from './scouting.mjs';

// "Analyse opponent" tab: target-team detection with Frank's overrides (stored by the app, saved in the session).
export function initOpponent(container,api){
  container.innerHTML=`<div class="scouting opponent"><h3>Analyse opponent</h3><p>Import the enemy team's demos. Players are matched by SteamID, never by name; the latest name is shown. Heuristic: a player in at least half of the included demos is core, and a demo belongs to the team when at least 3 of its players are core. Override below when this is wrong.</p>
  <div class="session-actions"><label for="demo-file" class="button primary">＋ Import enemy demos</label><button data-o="reset">Clear overrides</button></div>
  <p data-o="status" role="status"></p><div data-o="maps"></div>
  <h4>Roster</h4><div data-o="roster"></div><h4>Demos</h4><div data-o="demos"></div></div>`;
  const el=name=>container.querySelector(`[data-o="${name}"]`);let detection=null;
  const table=(headers,rows)=>rows.length?`<div class="scout-table"><table><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`:'<p class="muted">None.</p>';
  const side=s=>s===2?'T':s===3?'CT':'?';
  function render(){
    const entries=api.getEntries(),overrides=api.getOpponent();detection=detectOpponent(entries,overrides);api.setDetection?.(detection);const d=detection;
    if(!entries.length){el('status').textContent='Import demos to begin.';for(const n of ['maps','roster','demos'])el(n).innerHTML='';return;}
    el('status').textContent=!d.demos.length?`No team found with at least ${d.minCore} core players in one demo (${d.total} included demos).`:`Target team: ${d.core.length} core players; ${d.demos.length} of ${d.total} included demos belong to the team.${d.excluded.length?` ${d.excluded.length} excluded.`:''}${d.ambiguous?' Ambiguous: two teams appear equally often. Mark one opponent player as core to choose the team.':''}`;
    el('maps').innerHTML=d.maps.length?`<p>${d.maps.map(m=>`<strong>${esc(m.map)}</strong>: ${m.demos} ${m.demos===1?'demo':'demos'} / ${m.rounds} rounds`).join(' · ')}</p>`:'';
    el('roster').innerHTML=table(['Player','Status','Demos','Rounds','Maps','Override'],d.players.map(p=>[esc(p.name),`${esc(p.description)}${p.override?' (manual)':''}`,`${p.demos} of ${d.demos.length}`,String(p.rounds),esc(p.maps.join(', ')),
      `<select data-player="${esc(p.id)}" aria-label="Override for ${esc(p.name)}"><option value="">Auto</option><option value="core" ${p.override==='core'?'selected':''}>Core</option><option value="stand-in" ${p.override==='stand-in'?'selected':''}>Stand-in</option></select>`]));
    const include=(id,on)=>`<input type="checkbox" data-include="${esc(id)}" ${on?'checked':''} aria-label="Include demo">`,open=(id,label)=>`<button class="scout-evidence" data-open="${esc(id)}">${esc(label)}</button>`;
    el('demos').innerHTML=table(['Include','Demo','Map','Date','Opponent','Core / stand-ins'],[
      ...d.demos.map(x=>[include(x.entryId,true),open(x.entryId,x.source),esc(x.map),esc(x.date||'—'),`${x.teamKey==='team-1'?'Team 1':'Team 2'}, started ${side(x.startSide)}`,`${x.coreCount} core / ${x.standIns.length} stand-in`]),
      ...d.unmatched.map(x=>[include(x.entryId,true),open(x.entryId,x.source),esc(x.map),esc(x.date||'—'),'Not matched',esc(x.reason)]),
      ...d.excluded.map(x=>[include(x.entryId,false),open(x.entryId,x.source),esc(x.map),'—','Excluded','—'])]);
  }
  function update(change){const o=api.getOpponent();change(o);api.setOpponent(o);render();}
  container.addEventListener('change',e=>{const t=e.target;
    if(t.dataset.player!==undefined)update(o=>{const id=t.dataset.player;o.core=o.core.filter(x=>x!==id);o.standIn=o.standIn.filter(x=>x!==id);if(t.value==='core')o.core.push(id);if(t.value==='stand-in')o.standIn.push(id);});
    if(t.dataset.include!==undefined)update(o=>{const id=t.dataset.include;o.excluded=o.excluded.filter(x=>x!==id);if(!t.checked)o.excluded.push(id);});
  });
  container.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
    if(b.dataset.open){api.openRound(b.dataset.open,0,undefined,false);return;}
    if(b.dataset.o==='reset')update(o=>{o.core=[];o.standIn=[];o.excluded=[];});
  });
  return {refresh:render,getDetection:()=>detection};
}
