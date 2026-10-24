import {frameAt,activeEffects,worldToRadar,nextRoundIndex,validateReplay,effectForPath,formatLoadout,visibleGunshots} from "./core.mjs";
import {analyzeReplay,buildHeatmap} from "./analysis.mjs";
import {wrapLabel,placeLabel} from "./map-labels.mjs";
import {getLoadoutIcons,drawLoadoutIcon} from "./loadout-icons.mjs";
import {beginStep,finishReport} from "./diagnostics.mjs";
import {startDiagnostics,saveDiagnostics,cancelDiagnostics,showDiagnostics,showImportFailure} from "./diagnostics-ui.mjs";
const $=id=>document.getElementById(id),escape=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
const colors={2:"#edb65d",3:"#70b9e9",smoke:"#b7cbd5",fire:"#ff8455",flash:"#f5e9a0",he:"#dd9bb5",decoy:"#a6cfab"};
const labels={smoke:"Smoke",fire:"Molotov / incendiary",flash:"Flashbang",he:"HE grenade",decoy:"Decoy"};
const S={replay:null,index:0,tick:0,playing:false,speed:1,mode:"normal",loop:false,zoom:1,panX:0,panY:0,team:"all",selected:null,floor:"upper",names:true,weaponIcons:true,armorIcons:true,grenadeIcons:true,look:true,paths:true,effects:true,flashReach:false,trails:false,shots:true,freeze:true,utility:"all",tab:"events",notes:[],startTeams:new Map(),worker:null,sample:false,rosterStamp:"",eventStamp:"",customMap:null,analysis:null,heatmaps:[],heatmapCache:new Map()};
const canvas=$("radar"),ctx=canvas.getContext("2d"),mapImages=new Map();let mapDefs={},mapDef=null,mapImage=null,lastTime=0,lastPanel=0,renderId,drag=null,toastTimer,loadToken=0;
const clock=seconds=>{seconds=Math.max(0,Math.floor(seconds));return String(Math.floor(seconds/60)).padStart(2,"0")+":"+String(seconds%60).padStart(2,"0");};
const round=()=>S.replay?.rounds[S.index];
const rate=()=>S.replay?.tickRate??64;
const startTick=r=>S.freeze?r.live:r.start;
const name=id=>S.replay?.players.find(p=>p.id===String(id))?.name??"Unknown";
const focused=id=>S.team==="all"||S.startTeams.get(String(id))===Number(S.team);
function toast(message,ms=6500){$("toast").textContent=message;$("toast").hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$("toast").hidden=true,ms);}
function dirty(){S.rosterStamp="";S.eventStamp="";}
function setPlaying(value){S.playing=Boolean(value&&S.replay);$("play").textContent=S.playing?"Ⅱ":"▶";$("play").setAttribute("aria-label",S.playing?"Pause":"Play");}
function resetView(){S.zoom=1;S.panX=0;S.panY=0;$("zoom-reset").textContent="100%";}
function setZoom(value){S.zoom=Math.max(.65,Math.min(4,value));$("zoom-reset").textContent=Math.round(S.zoom*100)+"%";}
function visibleFloor(z){return !mapDef?.lower||S.floor==="all"||(S.floor==="lower"?z<mapDef.splitZ:z>=mapDef.splitZ);}
function setIndex(index,{keepMode=false,play=S.playing}={}){
  if(!S.replay||index<0||index>=S.replay.rounds.length)return;
  S.index=index;S.tick=startTick(round());if(!keepMode)S.mode="normal";
  dirty();renderRoundControls();renderEventList();renderNotes();setPlaying(play);
}
function startPistols(){
  if(!S.replay?.pistols?.length)return;
  S.mode="pistols";S.loop=false;$("loop").classList.remove("active");$("loop").setAttribute("aria-pressed","false");
  setIndex(S.replay.pistols[0],{keepMode:true,play:true});
  if(S.replay.pistols.length<2)toast("Only the first pistol is available in this recording. Playback will stop at its end.");
}
function seek(tick){if(!round())return;S.tick=Math.max(startTick(round()),Math.min(round().end,tick));dirty();}
function renderRoundControls(){
  if(!S.replay)return;
  const r=round();$("round-label").textContent=`ROUND ${String(r.number).padStart(2,"0")}`;
  $("rounds").innerHTML=S.replay.rounds.map((x,i)=>{const a=S.analysis?.rounds?.find(v=>v.roundIndex===i),buys=a?` · T ${a.teams[2].label} · CT ${a.teams[3].label}`:"",short=v=>({"full-buy":"FB",force:"FO",pistol:"P",eco:"E",mixed:"M",unknown:"?"}[v]??"?");return `<button class="round-button ${i===S.index?"selected":""} ${S.replay.pistols.includes(i)?"pistol":""}" data-round="${i}" aria-label="Round ${x.number}${S.replay.pistols.includes(i)?", pistol round":""}${buys}" aria-current="${i===S.index}" title="Round ${x.number} · ${x.winner===2?"T win":x.winner===3?"CT win":"Incomplete"}${buys}">${x.number}<span class="win-dot" style="background:${colors[x.winner]??"#67737d"}"></span>${a?`<small class="buy-label">${short(a.teams[2].label)}·${short(a.teams[3].label)}</small>`:""}</button>`;}).join("");
  $("pistols").classList.toggle("active",S.mode==="pistols");
  $("pistols").setAttribute("aria-pressed",String(S.mode==="pistols"));
  $("mode-label").textContent=S.mode==="pistols"?`Pistol strats · ${S.replay.pistols.map(i=>"R"+S.replay.rounds[i].number).join(" → ")}`:S.loop?"Looping current round":"Round playback";
  $("timeline").min=startTick(r);$("timeline").max=r.end;
  $("duration").textContent=clock((r.end-startTick(r))/rate());
  $("prev-round").disabled=S.index===0;$("next-round").disabled=S.index===S.replay.rounds.length-1;
  $("event-marks").innerHTML=r.events.filter(e=>["player_death","bomb_planted","bomb_defused"].includes(e.event_name)&&e.tick>=startTick(r)).map(e=>`<i style="left:${(e.tick-startTick(r))/(r.end-startTick(r))*100}%;background:${e.event_name==="player_death"?"#7b91a3":"#edb65d"}"></i>`).join("");
}
function renderScouting(){
  const box=$("scouting"),analysis=S.analysis;
  if(!analysis){box.hidden=true;return;}
  box.hidden=false;
  const side=team=>team===2?"T":"CT";
  $("representative-rounds").innerHTML=analysis.representatives.length?analysis.representatives.map(x=>{const count=analysis.rounds.filter(r=>r.teams[x.side]?.teamKey===x.teamKey&&r.teams[x.side]?.label===x.label).length;return `<button class="scout-button ${x.side===2?"t-scout":"ct-scout"}" data-scout-round="${x.roundIndex}" title="Play representative ${escape(x.label)} round for ${escape(x.teamKey)}">${escape(x.teamKey)} · ${side(x.side)} · ${escape(x.label)} <b>R${x.number} / ${count}</b></button>`;}).join(""):"<span class=\"micro muted\">No representative buy rounds found.</span>";
  const specials=analysis.rounds.flatMap(r=>r.specials.map(x=>({...x,roundIndex:r.roundIndex,number:r.number})));
  $("special-rounds").innerHTML=specials.map(x=>`<button class="special-button" data-scout-round="${x.roundIndex}" data-scout-tick="${x.tick}" title="Play this pattern">${escape(x.teamKey)} · ${side(x.side)} · ${escape(x.label)} <b>R${x.number}</b></button>`).join("");
  $("scouting-warnings").hidden=!analysis.warnings.length;$("scouting-warnings").textContent=analysis.warnings.join(" ");
}
$("special-rounds-toggle").onclick=()=>{const list=$("special-rounds");list.hidden=!list.hidden;$("special-rounds-toggle").setAttribute("aria-expanded",String(!list.hidden));};
function updateTimeline(){
  const r=round();if(!r)return;const elapsed=(S.tick-startTick(r))/rate();
  $("timeline").value=S.tick;$("timeline").style.setProperty("--played",`${(S.tick-startTick(r))/(r.end-startTick(r))*100}%`);$("elapsed").textContent=clock(elapsed);
  const plant=r.events.find(e=>e.event_name==="bomb_planted"&&e.tick<=S.tick);
  const finish=r.events.find(e=>["bomb_defused","bomb_exploded"].includes(e.event_name)&&e.tick<=S.tick);
  $("phase").textContent=S.tick<r.live?`Freeze time · ${clock((r.live-S.tick)/rate())}`:S.tick>=r.end?`${r.winner===2?"T":r.winner===3?"CT":"Round"} ${r.winner?"win":"ended"}`:finish?finish.event_name.replaceAll("_"," "):plant?`Bomb planted · ${clock((S.tick-plant.tick)/rate())}`:`Live · ${clock((S.tick-r.live)/rate())}`;
}
async function chooseMap(){
  const key=S.replay?.map??"de_mirage";
  mapDef=S.customMap??mapDefs[key]??null;mapImage=null;
  $("floor-select").hidden=!mapDef?.lower;
  $("map-error").hidden=Boolean(mapDef)||!S.replay;
  if(!mapDef){$("map-error").textContent=`No calibrated radar is bundled for ${key}. Add the correct image and overview coordinates in Help → Custom radar.`;return;}
  const url=S.floor==="lower"&&mapDef.lower?mapDef.lower:mapDef.image;
  if(mapImages.has(url)){mapImage=mapImages.get(url);return;}
  const img=new Image();
  try{await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;img.src=url;});mapImages.set(url,img);if(mapDef&&(S.floor==="lower"&&mapDef.lower?mapDef.lower:mapDef.image)===url)mapImage=img;}
  catch{$("map-error").hidden=false;$("map-error").textContent="The radar image could not be loaded. Open Help to provide a matching custom radar.";}
}
function noteKey(){const r=S.replay;return r?`stratscope-notes:${r.source}:${r.map}:${r.rounds.length}:${r.rounds.at(-1).end}`:"";}
function saveNotes(){try{localStorage.setItem(noteKey(),JSON.stringify(S.notes));}catch{toast("Browser storage is full or unavailable. Export your replay to retain notes.");}}
async function loadReplay(replay,{sample=false}={}){
  validateReplay(replay);S.analysis=null;S.replay=replay;S.sample=sample;S.selected=null;S.team="all";S.index=0;S.mode="normal";S.customMap=replay.customMap??null;S.floor="upper";S.startTeams.clear();
  for(const r of replay.rounds)for(const p of r.frames.find(f=>f.tick>=r.live)?.players??[])if(!S.startTeams.has(p.id))S.startTeams.set(p.id,p.team);
  S.notes=Array.isArray(replay.notes)?replay.notes:[];
  try{const saved=JSON.parse(localStorage.getItem(noteKey())??"null");if(Array.isArray(saved))S.notes=saved;}catch{}
  $("team-filter").value="all";$("floor-select").value="upper";$("file-name").textContent=replay.source;$("map-title").textContent=mapDefs[replay.map]?.name??replay.map;
  $("map-subtitle").textContent=`${replay.players.length} players · ${replay.rounds.length} rounds`;
  $("match-format").textContent="CS2";$("round-count").textContent=replay.rounds.length;
  $("pistol-hint").textContent=replay.pistols.length?replay.pistols.map(i=>"Round "+replay.rounds[i].number).join(" → ")+(replay.pistols.length===1?" · only available half":""):"No opening pistol in this file";
  for(const id of ["export-button","play","back","forward","timeline","add-note"])$(id).disabled=false;
  $("pistols").disabled=!replay.pistols.length;$("empty").hidden=true;$("sample-badge").hidden=!sample;
  resetView();setIndex(0,{play:false});await chooseMap();S.analysis=analyzeReplay(replay,{map:mapDef});S.heatmaps=[];S.heatmapCache.clear();renderScouting();renderRoundControls();dirty();
  if(replay.warnings.length)toast(replay.warnings.join(" "),10000);
}
function loading(show,stage="Reading locally",pct=0){$("loading").hidden=!show;if(show){$("empty").hidden=true;$("loading-stage").textContent=stage;$("loading-progress").value=pct;}else if(!S.replay)$("empty").hidden=false;}
function stopLoad(){cancelDiagnostics();loadToken++;S.worker?.terminate();S.worker=null;loading(false);}
async function decodeReplay(buffer){let stream=new Blob([buffer]).stream();const b=new Uint8Array(buffer);if(b[0]===31&&b[1]===139){if(!globalThis.DecompressionStream)throw new Error("This browser cannot decompress replays. Use a recent Chrome, Edge or Firefox.");stream=stream.pipeThrough(new DecompressionStream("gzip"));}return JSON.parse(await new Response(stream).text());}
async function openFile(file){
  if(!file)return;stopLoad();const token=loadToken;setPlaying(false);
  $("diagnostics-dialog").close();
  let report=await startDiagnostics(file);
  if(token!==loadToken)return;
  saveDiagnostics(report);
  const step=(stage,operation)=>{beginStep(report,stage,operation);saveDiagnostics(report);};
  const fail=error=>{S.worker?.terminate();S.worker=null;loading(false);showImportFailure(report,error);};
  try{
    step("Checking selected file","validateFile");
    if(!/\.(dem|strats|json)$/i.test(file.name))throw new Error("Choose an extracted .dem file or an exported .strats replay. Extract compressed archives first.");
    if(file.size>1.5*1024**3)throw new Error("This file exceeds the viewer's 1.5 GB input limit.");
    loading(true,"Reading "+file.name,1);
    step("Reading selected file","File.arrayBuffer");
    const buffer=await file.arrayBuffer();if(token!==loadToken)return;
    if(!/\.dem$/i.test(file.name)){
      step("Decoding exported replay","decodeReplay");
      const replay=await decodeReplay(buffer);if(token!==loadToken)return;
      step("Loading replay into viewer","loadReplay");
      await loadReplay(replay);if(token!==loadToken)return;
      saveDiagnostics(finishReport(report));loading(false);return;
    }
    step("Starting parser worker","Worker");
    const worker=new Worker("./parser-worker.js");S.worker=worker;
    worker.onmessage=async({data})=>{
      if(token!==loadToken)return;
      if(data.report){report=data.report;saveDiagnostics(report);}
      if(data.type==="progress")loading(true,data.stage,data.pct);
      else if(data.type==="done"){
        worker.terminate();S.worker=null;
        report.status="running";delete report.finishedAt;delete report.durationMs;
        step("Loading replay into viewer","loadReplay");
        try{await loadReplay(data.replay);if(token!==loadToken)return;saveDiagnostics(finishReport(report));loading(false);}
        catch(error){if(token===loadToken)fail(error);}
      }else if(data.type==="error"){
        if(report.error){worker.terminate();S.worker=null;loading(false);showDiagnostics();}
        else fail(new Error(data.message));
      }
    };
    worker.onerror=event=>{
      if(token!==loadToken)return;event.preventDefault();
      report.context.workerError={filename:event.filename,line:event.lineno,column:event.colno};
      fail(event.error||new Error(event.message||"The parser stopped unexpectedly. It may have exceeded available memory."));
    };
    worker.onmessageerror=()=>{if(token===loadToken)fail(new Error("The parser response could not be transferred to the viewer."));};
    worker.postMessage({buffer,name:file.name,report},[buffer]);
  }catch(error){if(token===loadToken)fail(error);}
}
async function loadSample(){stopLoad();const token=loadToken;setPlaying(false);loading(true,"Opening the public Mirage sample",25);try{const response=await fetch("./sample.strats");if(!response.ok)throw new Error("Sample download failed");const replay=await decodeReplay(await response.arrayBuffer());if(token!==loadToken)return;await loadReplay(replay,{sample:true});loading(false);}catch(e){if(token===loadToken){loading(false);toast(e.message);}}}
function renderRoster(players){
  const r=round();if(!r)return;
  const stamp=JSON.stringify(players.map(p=>[p.id,p.hp,p.team,p.weapon,p.money,p.armor,p.inventory,p.alive]))+S.team+S.selected;
  if(stamp===S.rosterStamp)return;S.rosterStamp=stamp;
  $("alive-count").textContent=`${players.filter(p=>p.alive).length} alive`;
  let html="";
  for(const team of [2,3]){
    const roster=players.filter(p=>p.team===team).sort((a,b)=>name(a.id).localeCompare(name(b.id)));
    html+=`<div class="team-head ${team===2?"t":"ct"}-text">${team===2?"TERRORISTS":"COUNTER-TERRORISTS"}<span>${roster.filter(p=>p.alive).length} / ${roster.length}</span></div>`;
    html+=roster.map((p,i)=>{const loadout=formatLoadout(p),funds=Number.isFinite(p.money)?`$${p.money}`:"Money unknown";return `<button class="player-row ${!p.alive?"dead":""} ${!focused(p.id)?"unfocused":""} ${p.id===S.selected?"selected":""}" data-player="${escape(p.id)}" title="${escape(name(p.id))} · ${escape(loadout.join(" · ")||"Equipment unknown")} · ${funds}"><span class="player-number" style="color:${colors[team]}">${p.alive?i+1:"×"}</span><span class="player-details"><span class="player-name">${escape(name(p.id))}</span><span class="loadout">${escape(loadout.join(" · ")||"Equipment unknown")}<br><em>${funds}</em></span></span><span class="player-hp">${p.alive?p.hp:"—"}<div class="hp-track"><div class="hp-fill" style="width:${Math.max(0,Math.min(100,p.hp))}%;color:${colors[team]}"></div></div></span></button>`;}).join("");
  }
  $("roster").innerHTML=html;$("selected-label").textContent=S.selected?name(S.selected):"All players";$("clear-selection").hidden=!S.selected;
}
function renderEventList(){
  const r=round();if(!r)return;
  const stamp=[S.index,S.tab,S.utility,S.team,S.selected,Math.floor(S.tick/rate())].join(":");if(stamp===S.eventStamp)return;S.eventStamp=stamp;
  const events=r.events.filter(e=>["player_death","bomb_planted","bomb_defused","bomb_exploded"].includes(e.event_name));
  $("event-feed").innerHTML=events.length?events.map(e=>{
    const kill=e.event_name==="player_death",body=kill?`${escape(e.attacker_name??"World")} <span style="color:#7d8b97">→</span> ${escape(e.user_name??"Unknown")}`:escape(e.event_name.replaceAll("_"," "));
    return `<button class="event-row ${e.tick>S.tick?"future":""}" data-tick="${e.tick}" title="Jump to this event"><span class="event-time">${clock((e.tick-r.live)/rate())}</span><span class="event-body"><span class="event-icon">${kill?"×":"◇"}</span>${body}${kill?`<small>${escape(e.weapon)}${e.headshot?" · headshot":""}</small>`:""}</span></button>`;
  }).join(""):'<p class="muted placeholder-text">No recorded kills or bomb events.</p>';
  const utility=r.effects.filter(e=>(S.utility==="all"||e.type===S.utility)&&(!e.thrower||focused(e.thrower))&&(!S.selected||e.thrower===S.selected));
  $("utility-feed").innerHTML=utility.length?utility.map(e=>`<button class="event-row ${e.start>S.tick?"future":""} ${e.start<=S.tick&&e.end>S.tick?"active":""}" data-tick="${Math.max(r.live,e.start-3*rate())}" title="Replay from 3 seconds before detonation"><span class="event-time">${clock((e.start-r.live)/rate())}</span><span class="event-body"><span style="color:${colors[e.type]}">${labels[e.type]}</span><small>${escape(e.name)} · ${e.estimatedLifetime?"~":""}${((e.end-e.start)/rate()).toFixed(1)}s</small></span></button>`).join(""):'<p class="muted placeholder-text">No matching utility in this round.</p>';
}
function renderNotes(){
  if(!S.replay)return;$("notes-list").innerHTML=S.notes.map((n,i)=>`<div class="note"><div class="note-controls"><button data-note="${i}">R${escape(n.round)} · ${clock((n.tick-(S.replay.rounds.find(r=>r.number===n.round)?.live??0))/rate())} ↗</button><button data-delete-note="${i}" aria-label="Delete note">✕</button></div>${escape(n.text)}</div>`).join("")||'<p class="micro muted">No notes yet. Mark the setups worth revisiting.</p>';
}
function pointOnPath(path,tick){const pts=path.points;if(!pts.length)return null;let i=0;while(i+1<pts.length&&pts[i+1][0]<=tick)i++;const a=pts[i],b=pts[i+1];if(!b)return a;const f=Math.max(0,Math.min(1,(tick-a[0])/(b[0]-a[0]||1)));return [tick,a[1]+(b[1]-a[1])*f,a[2]+(b[2]-a[2])*f,a[3]+(b[3]-a[3])*f];}
function draw(){
  const width=canvas.clientWidth,height=canvas.clientHeight,dpr=Math.min(devicePixelRatio||1,2);
  if(canvas.width!==Math.round(width*dpr)||canvas.height!==Math.round(height*dpr)){canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);}
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
  const size=Math.min(width-25,height-50)*S.zoom,ox=(width-size)/2+S.panX,oy=(height-size)/2+S.panY;
  const project=(x,y)=>{const [rx,ry]=worldToRadar(mapDef,x,y);return [ox+rx/1024*size,oy+ry/1024*size];};
  if(mapImage){ctx.globalAlpha=S.replay?0.86:0.25;ctx.drawImage(mapImage,ox,oy,size,size);ctx.globalAlpha=1;}
  if(!S.replay||!mapDef||!mapImage)return;
  const r=round(),players=frameAt(r,S.tick),scale=size/(1024*mapDef.scale),currentEffects=activeEffects(r,S.tick);
  ctx.lineJoin="round";ctx.lineCap="round";
  for(const team of S.heatmaps){
    const key=`${S.index}:${team}`;let heat=S.heatmapCache.get(key);if(!heat){heat=buildHeatmap(r,{tickRate:rate(),team});S.heatmapCache.set(key,heat);}
    for(const cell of heat.points){const [x,y]=project(cell.x,cell.y),strength=heat.maxWeight?cell.weight/heat.maxWeight:0,rad=Math.max(10,heat.cellSize*scale*.9),g=ctx.createRadialGradient(x,y,0,x,y,rad),alpha=Math.round((.12+.3*strength)*255).toString(16).padStart(2,"0");g.addColorStop(0,heat.color+alpha);g.addColorStop(1,heat.color+"00");ctx.fillStyle=g;ctx.fillRect(x-rad,y-rad,rad*2,rad*2);}
  }
  if(S.trails){
    for(const p of players){if(!focused(p.id))continue;ctx.beginPath();let first=true;for(const f of r.frames){if(f.tick<S.tick-5*rate()||f.tick>S.tick)continue;const q=f.players.find(x=>x.id===p.id);if(!q||!q.alive||!visibleFloor(q.z))continue;const [x,y]=project(q.x,q.y);if(first){ctx.moveTo(x,y);first=false;}else ctx.lineTo(x,y);}ctx.strokeStyle=colors[p.team];ctx.globalAlpha=p.id===S.selected?.8:.3;ctx.lineWidth=1.5;ctx.stroke();ctx.globalAlpha=1;}
  }
  if(S.effects)for(const e of currentEffects){
    if(!visibleFloor(e.z)||e.thrower&&!focused(e.thrower))continue;
    const [x,y]=project(e.x,e.y),age=(S.tick-e.start)/rate(),remaining=(e.end-S.tick)/rate();
    const alpha=S.selected&&e.thrower!==S.selected?.35:1;ctx.globalAlpha=alpha;
    const radius=(e.type==="smoke"?144:e.type==="fire"?135:e.type==="flash"?1500:80)*scale;
    if(e.type==="smoke"){
      const rad=radius*Math.min(1,.3+age*.9),g=ctx.createRadialGradient(x,y,0,x,y,Math.max(rad,1));g.addColorStop(0,"#b9cdd97d");g.addColorStop(.75,"#adc7d371");g.addColorStop(1,"#bcd3df25");ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,rad,0,Math.PI*2);ctx.fill();ctx.strokeStyle="#bcd5dfba";ctx.lineWidth=1;ctx.setLineDash([3,3]);ctx.stroke();ctx.setLineDash([]);
    }else if(e.type==="fire"){
      const rad=radius*Math.min(1,.5+age*.6);const g=ctx.createRadialGradient(x,y,0,x,y,Math.max(rad,1));g.addColorStop(0,"#ffb35a96");g.addColorStop(.7,"#ff784a71");g.addColorStop(1,"#e84d2230");ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,rad,0,Math.PI*2);ctx.fill();ctx.strokeStyle="#ffb16ac0";ctx.setLineDash([4,3]);ctx.lineWidth=1.2;ctx.stroke();ctx.setLineDash([]);
      ctx.strokeStyle="#ffc07d95";for(let a=0;a<5;a++){const px=x+Math.cos(a*1.256+age*.3)*rad*.5,py=y+Math.sin(a*1.256+age*.3)*rad*.5;ctx.beginPath();ctx.moveTo(px-2,py+3);ctx.lineTo(px,py-4);ctx.lineTo(px+2,py+2);ctx.stroke();}
    }else if(e.type==="flash"&&S.flashReach){const pulse=Math.min(1,age/.18),rad=Math.max(8,radius*pulse);ctx.fillStyle=colors.flash+"0d";ctx.strokeStyle=colors.flash+"42";ctx.lineWidth=1;ctx.beginPath();ctx.arc(x,y,rad,0,Math.PI*2);ctx.fill();ctx.stroke();}
    else if(e.type==="flash"){ctx.fillStyle=colors.flash;ctx.beginPath();ctx.arc(x,y,4,0,Math.PI*2);ctx.fill();}
    else{ctx.fillStyle=colors[e.type]+"55";ctx.strokeStyle=colors[e.type];ctx.lineWidth=1;ctx.beginPath();ctx.arc(x,y,Math.max(5,radius*(.45+Math.min(1,age)*.7)),0,Math.PI*2);ctx.fill();ctx.stroke();}
    if(["smoke","fire"].includes(e.type)){ctx.fillStyle="#111b23cf";ctx.fillRect(x-11,y-6,22,12);ctx.fillStyle=e.type==="smoke"?"#e0ecf2":"#ffd7a5";ctx.font="8px Segoe UI, sans-serif";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText((e.estimatedLifetime?"~":"")+Math.ceil(remaining),x,y);}
    ctx.globalAlpha=1;
  }
  if(S.paths)for(const path of r.grenades){
    if(S.tick<path.start||!focused(path.thrower))continue;
    const effect=effectForPath(r.effects,path,rate());
    if(S.tick>(effect?.end??path.end+2*rate()))continue;
    const p=pointOnPath(path,Math.min(S.tick,path.end));if(!p||!visibleFloor(p[3]))continue;
    ctx.strokeStyle=colors[path.type];ctx.globalAlpha=S.selected&&path.thrower!==S.selected?.25:.85;ctx.lineWidth=S.selected===path.thrower?2:1.2;ctx.setLineDash([4,3]);ctx.beginPath();let first=true;
    for(const q of path.points){if(q[0]>S.tick)break;const [x,y]=project(q[1],q[2]);if(first){ctx.moveTo(x,y);first=false;}else ctx.lineTo(x,y);}const [x,y]=project(p[1],p[2]);ctx.lineTo(x,y);ctx.stroke();ctx.setLineDash([]);
    if(S.tick<=path.end){ctx.fillStyle=colors[path.type];ctx.strokeStyle="#0a1118";ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(x,y,4,0,Math.PI*2);ctx.fill();ctx.stroke();}
    ctx.globalAlpha=1;
  }
  if(S.shots)for(const shot of visibleGunshots(r.events,S.tick,rate())){
    const id=String(shot.user_steamid??shot.steamid??""),shooter=frameAt(r,shot.tick).find(p=>p.id===id);if(!shooter||!visibleFloor(shooter.z)||!focused(id))continue;
    const sx=Number.isFinite(shot.user_X)?shot.user_X:shooter.x,sy=Number.isFinite(shot.user_Y)?shot.user_Y:shooter.y,sz=Number.isFinite(shot.user_Z)?shot.user_Z:shooter.z;if(!visibleFloor(sz))continue;const [x,y]=project(sx,sy),angle=-(Number(shot.user_yaw??shooter.yaw)||0)*Math.PI/180,length=65;ctx.globalAlpha=.85;ctx.strokeStyle="#ffe29a";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x+Math.cos(angle)*7,y+Math.sin(angle)*7);ctx.lineTo(x+Math.cos(angle)*length,y+Math.sin(angle)*length);ctx.stroke();ctx.fillStyle="#fff4c4";ctx.beginPath();ctx.arc(x+Math.cos(angle)*8,y+Math.sin(angle)*8,3,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
  }
  const plant=r.events.find(e=>e.event_name==="bomb_planted"&&e.tick<=S.tick);
  const bombEnded=r.events.find(e=>["bomb_defused","bomb_exploded"].includes(e.event_name)&&e.tick<=S.tick);
  if(plant&&!bombEnded){const bx=plant.x??plant.user_X,by=plant.y??plant.user_Y,bz=plant.z??plant.user_Z??0;if(Number.isFinite(bx)&&Number.isFinite(by)&&visibleFloor(bz)){const [x,y]=project(bx,by);ctx.fillStyle="#f0c775";ctx.fillRect(x-6,y-6,12,12);ctx.fillStyle="#101920";ctx.font="bold 7px Segoe UI";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText("C4",x,y);ctx.strokeStyle="#f0c775";ctx.globalAlpha=.4+.3*Math.sin(S.tick/rate()*6);ctx.beginPath();ctx.arc(x,y,11,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;}}
  const tagBoxes=[],positions=[];
  for(const p of players){
    if(!visibleFloor(p.z))continue;const [x,y]=project(p.x,p.y),focus=focused(p.id),selected=p.id===S.selected;
    ctx.globalAlpha=focus?(S.selected&&!selected?.65:1):.15;
    const color=colors[p.team]??"#afbbc4",angle=-p.yaw*Math.PI/180;
    if(!p.alive){ctx.strokeStyle=color;ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(x-3,y-3);ctx.lineTo(x+3,y+3);ctx.moveTo(x+3,y-3);ctx.lineTo(x-3,y+3);ctx.stroke();positions.push({p,x,y,alpha:focus?.55:.15});ctx.globalAlpha=1;continue;}
    if(S.look){ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.fillStyle=color+"22";ctx.beginPath();ctx.moveTo(0,0);ctx.arc(0,0,selected?48:33,-.34,.34);ctx.closePath();ctx.fill();ctx.strokeStyle=color;ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(5,0);ctx.lineTo(selected?32:22,0);ctx.lineTo(selected?28:18,-3);ctx.moveTo(selected?32:22,0);ctx.lineTo(selected?28:18,3);ctx.stroke();ctx.restore();}
    if(selected){ctx.strokeStyle="#fff1d0";ctx.lineWidth=1.4;ctx.beginPath();ctx.arc(x,y,10,0,Math.PI*2);ctx.stroke();}
    ctx.fillStyle=color;ctx.strokeStyle="#111a22";ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,5.5,0,Math.PI*2);ctx.fill();ctx.stroke();
    if((p.inventory??[]).some(i=>String(i).toLowerCase()==="c4")){ctx.fillStyle="#f6e9bb";ctx.fillRect(x-2,y-2,4,4);}
    const blinds=r.events.filter(e=>e.event_name==="player_blind"&&e.user_steamid===p.id&&e.tick<=S.tick&&e.tick+(e.blind_duration??0)*rate()>S.tick);
    if(blinds.length){ctx.strokeStyle="#fff7c2";ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(x,y,8,0,Math.PI*2);ctx.stroke();}
    positions.push({p,x,y,alpha:ctx.globalAlpha});ctx.globalAlpha=1;
  }
  if(S.names||S.weaponIcons||S.armorIcons||S.grenadeIcons)for(const {p,x,y,alpha} of positions){
    if(!focused(p.id))continue;
    ctx.font="11px Segoe UI, Arial, sans-serif";ctx.textAlign="left";ctx.textBaseline="top";
    const lines=[];
    if(S.names)lines.push(...wrapLabel(name(p.id),t=>ctx.measureText(t).width));
    const icons=getLoadoutIcons(p,{weapons:S.weaponIcons,armor:S.armorIcons,grenades:S.grenadeIcons});
    if(!lines.length&&!icons.length)continue;
    const tw=Math.max(0,...lines.map(t=>ctx.measureText(t).width),Math.min(4,icons.length)*42)+12,th=lines.length*14+Math.ceil(icons.length/4)*40+8;
    const [tx,ty]=placeLabel(x,y,tw,th,width,height,tagBoxes);
    ctx.globalAlpha=alpha;ctx.strokeStyle=colors[p.team]+"88";ctx.lineWidth=.7;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(Math.max(tx,Math.min(tx+tw,x)),Math.max(ty,Math.min(ty+th,y)));ctx.stroke();
    ctx.fillStyle="#101821e8";ctx.fillRect(tx,ty,tw,th);ctx.strokeRect(tx,ty,tw,th);
    lines.forEach((text,i)=>{ctx.fillStyle=colors[p.team];ctx.fillText(text,tx+6,ty+4+i*14);});
    icons.forEach((icon,i)=>drawLoadoutIcon(ctx,icon,tx+6+(i%4)*42,ty+4+lines.length*14+Math.floor(i/4)*40,28));ctx.globalAlpha=1;
  }
  if(performance.now()-lastPanel>180){renderRoster(players);renderEventList();lastPanel=performance.now();}
}
function animate(now){
  const dt=lastTime?Math.min((now-lastTime)/1000,.25):0;lastTime=now;
  if(S.playing&&round()){
    S.tick+=dt*rate()*S.speed;
    if(S.tick>=round().end){const next=nextRoundIndex(S.replay,S.index,S.mode,S.loop);if(next===null){S.tick=round().end;setPlaying(false);if(S.mode==="pistols")toast("Pistol strats complete.",3000);}else setIndex(next,{keepMode:true,play:true});}
  }
  updateTimeline();draw();renderId=requestAnimationFrame(animate);
}
$("demo-file").addEventListener("change",e=>{openFile(e.target.files[0]);e.target.value="";});
$("sample-button").onclick=loadSample;$("cancel-load").onclick=stopLoad;
$("play").onclick=()=>{if(!S.replay)return;if(!S.playing&&S.tick>=round().end){if(S.mode==="pistols")setIndex(S.replay.pistols[0],{keepMode:true,play:false});else seek(startTick(round()));}setPlaying(!S.playing);};
$("pistols").onclick=startPistols;
$("prev-round").onclick=()=>setIndex(S.index-1);$("next-round").onclick=()=>setIndex(S.index+1);
$("back").onclick=()=>seek(S.tick-5*rate());$("forward").onclick=()=>seek(S.tick+5*rate());
$("timeline").oninput=e=>seek(Number(e.target.value));
$("rounds").onclick=e=>{const b=e.target.closest("[data-round]");if(b)setIndex(Number(b.dataset.round));};
$("speed-buttons").onclick=e=>{const b=e.target.closest("[data-speed]");if(!b)return;S.speed=Number(b.dataset.speed);for(const button of $("speed-buttons").children){button.classList.toggle("selected",button===b);button.setAttribute("aria-pressed",String(button===b));}};
$("loop").onclick=()=>{S.loop=!S.loop;$("loop").classList.toggle("active",S.loop);$("loop").setAttribute("aria-pressed",String(S.loop));renderRoundControls();};
$("team-filter").onchange=e=>{S.team=e.target.value;dirty();};
for(const key of ["names","weaponIcons","armorIcons","grenadeIcons","look","paths","effects","flashReach","trails","shots","freeze"]){$(key+"-toggle").onchange=e=>{S[key]=e.target.checked;if(key==="freeze"&&round()){S.tick=Math.max(startTick(round()),S.tick);renderRoundControls();}};}
$("reset-layers").onclick=()=>{for(const key of ["names","weaponIcons","armorIcons","grenadeIcons","look","paths","effects","flashReach","trails","shots","freeze"]){S[key]=!["trails","flashReach"].includes(key);$(key+"-toggle").checked=S[key];}S.heatmaps=[];document.querySelectorAll("[data-heatmap]").forEach(b=>{b.classList.remove("selected");b.setAttribute("aria-pressed","false");});if(round()){seek(S.tick);renderRoundControls();}};
$("scouting").onclick=e=>{const heat=e.target.closest("[data-heatmap]"),jump=e.target.closest("[data-scout-round]");if(heat){const team=Number(heat.dataset.heatmap),on=S.heatmaps.includes(team);S.heatmaps=on?S.heatmaps.filter(x=>x!==team):[...S.heatmaps,team];heat.classList.toggle("selected",!on);heat.setAttribute("aria-pressed",String(!on));}else if(jump){setIndex(Number(jump.dataset.scoutRound),{play:false});if(jump.dataset.scoutTick)seek(Math.max(startTick(round()),Number(jump.dataset.scoutTick)-2*rate()));setPlaying(true);}};
$("floor-select").onchange=e=>{S.floor=e.target.value;chooseMap();};
$("zoom-in").onclick=()=>setZoom(S.zoom*1.2);$("zoom-out").onclick=()=>setZoom(S.zoom/1.2);$("zoom-reset").onclick=resetView;
canvas.addEventListener("wheel",e=>{e.preventDefault();setZoom(S.zoom*Math.exp(-e.deltaY*.001));},{passive:false});
canvas.onpointerdown=e=>{drag={x:e.clientX,y:e.clientY,px:S.panX,py:S.panY};canvas.setPointerCapture(e.pointerId);canvas.classList.add("dragging");};
canvas.onpointermove=e=>{if(drag){S.panX=drag.px+e.clientX-drag.x;S.panY=drag.py+e.clientY-drag.y;}};
canvas.onpointerup=e=>{if(drag&&Math.hypot(e.clientX-drag.x,e.clientY-drag.y)<4&&round()&&mapDef){const box=canvas.getBoundingClientRect(),size=Math.min(box.width-25,box.height-50)*S.zoom,ox=(box.width-size)/2+S.panX,oy=(box.height-size)/2+S.panY,mx=e.clientX-box.left,my=e.clientY-box.top;const p=frameAt(round(),S.tick).filter(p=>p.alive&&visibleFloor(p.z)).find(p=>{const [x,y]=worldToRadar(mapDef,p.x,p.y);return Math.hypot(ox+x/1024*size-mx,oy+y/1024*size-my)<12;});if(p){S.selected=S.selected===p.id?null:p.id;dirty();}}drag=null;canvas.classList.remove("dragging");};
canvas.onpointercancel=()=>{drag=null;canvas.classList.remove("dragging");};canvas.ondblclick=resetView;
$("fullscreen").onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.querySelector(".viewer").requestFullscreen();}catch{toast("Fullscreen is unavailable in this browser.");}};
$("roster").onclick=e=>{const b=e.target.closest("[data-player]");if(b){S.selected=S.selected===b.dataset.player?null:b.dataset.player;dirty();}};
$("clear-selection").onclick=()=>{S.selected=null;dirty();};
for(const panel of ["event-feed","utility-feed"])$(panel).onclick=e=>{const b=e.target.closest("[data-tick]");if(b){seek(Number(b.dataset.tick));setPlaying(false);}};
document.querySelector(".right-tabs").onclick=e=>{const b=e.target.closest("[data-tab]");if(!b)return;S.tab=b.dataset.tab;for(const t of ["events","utility","notes"]){$(t+"-panel").hidden=t!==S.tab;document.querySelector(`[data-tab="${t}"]`).classList.toggle("selected",t===S.tab);}dirty();renderEventList();};
document.querySelector(".utility-filters").onclick=e=>{const b=e.target.closest("[data-utility]");if(!b)return;S.utility=b.dataset.utility;for(const x of document.querySelectorAll("[data-utility]"))x.classList.toggle("selected",x===b);dirty();renderEventList();};
$("add-note").onclick=()=>{const text=$("note-text").value.trim();if(!text||!round())return;S.notes.push({round:round().number,tick:Math.round(S.tick),text});$("note-text").value="";saveNotes();renderNotes();};
$("notes-list").onclick=e=>{const del=e.target.closest("[data-delete-note]"),b=e.target.closest("[data-note]");if(del){S.notes.splice(Number(del.dataset.deleteNote),1);saveNotes();renderNotes();}else if(b){const n=S.notes[Number(b.dataset.note)];setIndex(S.replay.rounds.findIndex(r=>r.number===n.round),{play:false});seek(n.tick);}};
$("export-button").onclick=async()=>{
  if(!S.replay)return;try{const text=JSON.stringify({...S.replay,notes:S.notes,customMap:S.customMap});let blob=new Blob([text],{type:"application/json"});if(globalThis.CompressionStream)blob=await new Response(blob.stream().pipeThrough(new CompressionStream("gzip"))).blob();const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=S.replay.source.replace(/\.(dem|strats|json)$/i,"")+".strats";a.click();setTimeout(()=>URL.revokeObjectURL(a.href),10000);toast("Replay exported with your notes.",3000);}catch(e){toast("Export failed: "+e.message);}
};
$("diagnostics-button").onclick=()=>{setPlaying(false);showDiagnostics();};
const openHelp=()=>{$("diagnostics-dialog").close();setPlaying(false);$("help-dialog").showModal();if(mapDef){$("map-x").value=mapDef.x;$("map-y").value=mapDef.y;$("map-scale").value=mapDef.scale;}};
$("help-button").onclick=openHelp;$("about-button").onclick=openHelp;$("close-help").onclick=()=>$("help-dialog").close();
$("apply-map").onclick=async()=>{const f=$("custom-radar").files[0],x=Number($("map-x").value),y=Number($("map-y").value),scale=Number($("map-scale").value);if(!f||![x,y,scale].every(Number.isFinite)||scale<=0){toast("Choose a radar image and valid overview coordinates.");return;}if(f.size>10*1024**2){toast("Choose a radar image smaller than 10 MB.");return;}const image=await new Promise((resolve,reject)=>{const fr=new FileReader();fr.onload=()=>resolve(fr.result);fr.onerror=reject;fr.readAsDataURL(f);});S.customMap={image,x,y,scale,name:S.replay?.map??"Custom radar",lower:null,splitZ:null};S.floor="upper";resetView();await chooseMap();$("help-dialog").close();toast("Custom radar applied. Export the replay to keep it.");};
window.addEventListener("keydown",e=>{if(["INPUT","TEXTAREA","SELECT"].includes(e.target.tagName)||$("help-dialog").open||$("diagnostics-dialog").open)return;if(!S.replay)return;const k=e.key.toLowerCase();if([" ","arrowleft","arrowright","[","]","p","l","home"].includes(k))e.preventDefault();if(k===" ")$("play").click();else if(k==="arrowleft")seek(S.tick-5*rate());else if(k==="arrowright")seek(S.tick+5*rate());else if(k==="[")setIndex(S.index-1);else if(k==="]")setIndex(S.index+1);else if(k==="p")startPistols();else if(k==="l")$("loop").click();else if(k==="home")seek(startTick(round()));});
let dragDepth=0;document.addEventListener("dragenter",e=>{if(e.dataTransfer.types.includes("Files")){e.preventDefault();dragDepth++;$("drop-overlay").hidden=false;}});document.addEventListener("dragover",e=>{if(e.dataTransfer.types.includes("Files"))e.preventDefault();});document.addEventListener("dragleave",e=>{dragDepth--;if(dragDepth<=0)$("drop-overlay").hidden=true;});document.addEventListener("drop",e=>{e.preventDefault();dragDepth=0;$("drop-overlay").hidden=true;const files=e.dataTransfer.files;if(files.length>1)toast("Opening the first file. Review one match at a time.");openFile(files[0]);});
try{const response=await fetch("./maps/maps.json");if(!response.ok)throw new Error("Map definitions unavailable");mapDefs=await response.json();await chooseMap();}catch(e){toast(e.message);}
requestAnimationFrame(animate);
