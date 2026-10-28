// Strat Scope 3D review app: loads a demo/replay, runs the review engine and plays critiqued clips in 3D.
import {frameAt, activeEffects, validateReplay} from "../core.mjs";
import {createReport} from "../diagnostics.mjs";
import {reviewReplay} from "./engine/review.mjs";
import {frameBefore, clock as roundClock, isGun} from "./engine/util.mjs";
import {ReviewScene} from "./scene3d.mjs";

const $ = id => document.getElementById(id);
const S = {replay: null, detail: null, review: null, round: 0, tick: 0, start: 0, end: 0, playing: false, speed: 1, clip: null, focus: null, player: "", kind: "", lastNote: -1};
const scene = new ReviewScene($("scene"));
let mapDefs = {}, last = 0, toastTimer, worker;

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
const fmt = (v, d = 2) => v === null || v === undefined || !Number.isFinite(v) ? "–" : v.toFixed(d);
const pct = v => v === null || v === undefined ? "–" : Math.round(v * 100) + "%";
const nameOf = id => S.replay?.players.find(p => p.id === id)?.name ?? id;
function toast(text, ms = 4000) { const t = $("toast"); t.textContent = text; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => t.hidden = true, ms); }

// ---------- loading ----------
async function decode(buffer) {
  const b = new Uint8Array(buffer); let stream = new Blob([buffer]).stream();
  if (b[0] === 31 && b[1] === 139) stream = stream.pipeThrough(new DecompressionStream("gzip"));
  return JSON.parse(await new Response(stream).text());
}
function loading(on, stage = "", value = 0) { $("loading").hidden = !on; $("empty").hidden = on || Boolean(S.replay); $("loading-stage").textContent = stage; $("loading-bar").value = value; }
async function openFile(file) {
  if (!file) return;
  try {
    if (/\.dem$/i.test(file.name)) return parseDem(file);
    loading(true, "Opening " + file.name, 20);
    const data = await decode(await file.arrayBuffer());
    if (data.format === "strat-scope-review") await use(validateReplay(data.replay), data.detail ?? null, file.name);
    else await use(validateReplay(data), null, file.name);
  } catch (e) { loading(false); toast(e.message); }
}
async function parseDem(file) {
  worker?.terminate();
  loading(true, "Reading " + file.name, 1);
  const buffer = await file.arrayBuffer();
  const report = createReport({name: file.name, size: file.size});
  worker = new Worker("./review-worker.js");
  worker.onmessage = async ({data}) => {
    if (data.type === "progress") loading(true, data.stage, data.pct);
    else if (data.type === "done") { worker.terminate(); worker = null; await use(validateReplay(data.replay), data.detail, file.name); }
    else if (data.type === "error") { worker.terminate(); worker = null; loading(false); toast("Parsing failed: " + data.message, 8000); }
  };
  worker.postMessage({buffer, name: file.name, report}, [buffer]);
}
async function use(replay, detail, label) {
  loading(true, "Reviewing duels, trades and decisions", 96);
  await new Promise(r => setTimeout(r, 20));
  S.replay = replay; S.detail = detail; S.review = reviewReplay(replay, {detail});
  S.player = ""; S.clip = null; S.focus = S.review.players[0]?.id ?? null;
  $("file-name").textContent = `${label} · ${replay.map} · ${replay.rounds.length} rounds`;
  const c = S.review.coverage;
  $("coverage").textContent = c.damage ? `full detail${c.spotted ? " · spotting" : ""}${c.pitch ? " · pitch" : ""}` : "coarse replay: no damage, spotting or pitch data";
  $("save-review").disabled = false;
  const def = mapDefs[replay.map] ?? null;
  const fix = u => u ? "../" + u.replace(/^\.\//, "") : null;
  scene.setMap(def, def ? {upper: fix(def.image), lower: fix(def.lower)} : {});
  if (!def) toast(`No calibrated radar for ${replay.map}; players are drawn without a ground image.`, 6000);
  $("clip-player").innerHTML = `<option value="">All players · featured</option>` + S.review.players.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("");
  loading(false); $("empty").hidden = true; $("hud").hidden = false;
  renderLists(); renderPlayer();
  const first = S.review.clips.find(c => c.featured) ?? S.review.clips[0];
  if (first) openClip(first); else openRound(0);
}

// ---------- sampling ----------
function sample(index, tick) {
  const round = S.replay.rounds[index], fine = S.detail?.fine?.[index];
  const coarse = frameAt(round, tick), base = new Map(coarse.map(p => [p.id, p]));
  const a = fine?.length ? frameBefore(fine, tick) : null;
  if (a && tick - a.tick <= 4 && a.tick <= tick) {
    const b = fine[fine.indexOf(a) + 1], alpha = b && b.tick - a.tick <= 4 ? (tick - a.tick) / (b.tick - a.tick) : 0, other = new Map((b?.players ?? []).map(p => [p.id, p]));
    return a.players.map(p => {
      const q = other.get(p.id), c = base.get(p.id) ?? {};
      if (!q || alpha === 0) return {...c, ...p};
      const yaw = ((q.yaw - p.yaw + 540) % 360) - 180;
      return {...c, ...p, x: p.x + (q.x - p.x) * alpha, y: p.y + (q.y - p.y) * alpha, z: p.z + (q.z - p.z) * alpha, yaw: p.yaw + yaw * alpha, pitch: p.pitch + (q.pitch - p.pitch) * alpha};
    });
  }
  return coarse;
}
function shotsNear(index, tick) {
  const rate = S.replay.tickRate, win = rate * 0.12;
  const list = S.detail?.shots ? S.detail.shots.filter(s => s.round === index && s.tick <= tick && s.tick > tick - win)
    : S.replay.rounds[index].events.filter(e => e.event_name === "weapon_fire" && e.tick <= tick && e.tick > tick - win).map(e => ({tick: e.tick, id: String(e.user_steamid), weapon: e.weapon, x: e.user_X, y: e.user_Y, z: e.user_Z, yaw: e.user_yaw, pitch: 0}));
  return list.filter(s => isGun(s.weapon)).map(s => ({...s, age: (tick - s.tick) / win}));
}

// ---------- clips & rounds ----------
function openClip(clip) {
  S.clip = clip; S.round = clip.round; S.start = clip.start; S.end = clip.end; S.focus = clip.player; S.lastNote = -1;
  setRound(); seek(clip.start); renderCritique(); renderLists(); renderPlayer(); setPlaying(true);
}
function openRound(index) {
  S.clip = null; S.round = index; const r = S.replay.rounds[index]; S.start = r.live; S.end = r.end; S.lastNote = -1;
  if (!S.focus) S.focus = S.review.players[0]?.id;
  setRound(); seek(r.live); renderCritique(); renderLists(); setPlaying(false);
}
function setRound() {
  const r = S.replay.rounds[S.round];
  scene.setRound(r, S.replay.players); scene.setGround(r.frames);
  scene.follow = true;
}
function notes() {
  if (S.clip) return S.clip.notes;
  return S.review.findings.filter(f => f.round === S.round && (!S.focus || f.player === S.focus)).map(f => ({...f, tip: ""}));
}
function seek(tick) { S.tick = Math.max(S.start, Math.min(S.end, tick)); S.lastNote = notes().filter(n => n.tick < S.tick).length - 1; $("note-pop").hidden = true; }
function setPlaying(on) { S.playing = on && Boolean(S.replay); $("play").textContent = S.playing ? "❚❚" : "▶"; if (S.playing && S.tick >= S.end) seek(S.start); }
function jumpNote(dir) {
  const list = notes(); if (!list.length) return;
  const i = dir > 0 ? list.findIndex(n => n.tick > S.tick + 2) : list.map(n => n.tick < S.tick - S.replay.tickRate * 2.5).lastIndexOf(true);
  const n = list[i]; if (n) { seek(n.tick - S.replay.tickRate * 2); setPlaying(true); }
}

// ---------- rendering ----------
function renderLists() {
  if (!S.review) return;
  const clips = S.review.clips.filter(c => (S.player ? c.player === S.player : c.featured) && (!S.kind || c.kind === S.kind || c.kind === "mixed"));
  $("clip-list").innerHTML = clips.length ? clips.map(c => `<button class="clip ${c.kind}${S.clip?.id === c.id ? " active" : ""}" data-clip="${esc(c.id)}"><span class="score">${c.score}</span><b>${esc(c.title)}</b><small>${esc(nameOf(c.player))} · R${c.roundNumber} · ${c.clock} · ${c.notes.length} note${c.notes.length > 1 ? "s" : ""}${c.wpa ? ` · ${c.wpa > 0 ? "+" : ""}${c.wpa}% WPA` : ""}</small></button>`).join("") : `<p class="muted">No clips match this filter.</p>`;
  const rows = S.review.players;
  const r2 = rows.some(p => p.ratings.hltv2 !== null);
  $("rating-table").innerHTML = `<table><thead><tr><th>Player</th><th title="Scope Rating (composite)">Scope</th><th title="${r2 ? "HLTV 2.0 approximation" : "HLTV 1.0"}">${r2 ? "HLTV2≈" : "HLTV1"}</th><th title="Win probability added per round">Impact</th><th title="Mechanics score 0-100">Mech</th><th title="Decision score 0-100">Dec</th><th>K–D</th><th>ADR</th><th>KAST</th></tr></thead><tbody>` +
    rows.map(p => `<tr data-player="${esc(p.id)}" class="${p.id === S.focus ? "sel" : ""}"><td class="${p.team === 2 ? "t-text" : "ct-text"}" title="${esc(p.name)}">${esc(p.name)}</td><td><b>${fmt(p.ratings.scope)}</b></td><td>${fmt(r2 ? p.ratings.hltv2 : p.ratings.hltv1)}</td><td class="${p.ratings.impactPerRound >= 0 ? "good" : "bad"}">${p.ratings.impactPerRound > 0 ? "+" : ""}${fmt(p.ratings.impactPerRound, 1)}</td><td>${p.ratings.mechanics ?? "–"}</td><td>${p.ratings.decisions}</td><td>${p.stats.kills}–${p.stats.deaths}</td><td>${fmt(p.stats.adr, 0)}</td><td>${pct(p.stats.kast)}</td></tr>`).join("") + `</tbody></table><p class="muted micro">Impact = round win probability added per round (%). Ratings are local estimates, not official HLTV/Leetify/FACEIT values.</p>`;
  $("round-list").innerHTML = S.review.rounds.map(r => `<button class="round-row${!S.clip && S.round === r.index ? " active" : ""}" data-round="${r.index}"><span>R${r.number}</span><span class="${Number(r.winner) === 2 ? "t-text" : "ct-text"}">${Number(r.winner) === 2 ? "T" : Number(r.winner) === 3 ? "CT" : "?"} · ${esc(String(r.reason).replace(/^#SFUI_Notice_/, "").replaceAll("_", " "))}</span><span class="muted">${S.review.findings.filter(f => f.round === r.index).length} notes</span></button>`).join("");
}
function renderCritique() {
  const el = $("critique");
  if (!S.clip) { el.innerHTML = `<h3>Round ${S.replay.rounds[S.round].number}</h3><div class="meta">Full round · notes shown for ${esc(nameOf(S.focus))}</div>` + notesHtml(notes()); return; }
  const c = S.clip;
  el.innerHTML = `<h3>${esc(c.title)}</h3><div class="meta">${esc(nameOf(c.player))} · Round ${c.roundNumber} · ${c.clock}${c.wpa ? ` · round impact ${c.wpa > 0 ? "+" : ""}${c.wpa}% win probability` : ""}</div>` + notesHtml(c.notes);
}
function notesHtml(list) {
  if (!list.length) return `<p class="muted">No critiques for this selection.</p>`;
  const sev = {1: "MINOR", 2: "MAJOR", 3: "CRITICAL"};
  return list.map((n, i) => `<button class="note ${n.kind}" data-note="${i}"><span class="when">${n.clock}</span><span class="sev">${n.kind === "highlight" ? "GOOD" : sev[n.severity]}</span><b>${esc(n.title)}</b><p>${esc(n.detail)}</p>${n.tip ? `<p class="tip">→ ${esc(n.tip)}</p>` : ""}</button>`).join("");
}
function renderPlayer() {
  const p = S.review?.players.find(x => x.id === S.focus); const el = $("player-card");
  if (!p) { el.innerHTML = ""; return; }
  const m = p.mechanics, bar = (label, v, txt) => `<div class="kv"><span>${label}</span><span>${txt}</span></div><div class="bar"><i style="width:${Math.max(0, Math.min(100, v ?? 0))}%"></i></div>`;
  const scale = (v, good, bad) => v === null || v === undefined ? null : (v - bad) / (good - bad) * 100;
  el.innerHTML = `<h3 class="${p.team === 2 ? "t-text" : "ct-text"}">${esc(p.name)}</h3>
  <div class="big-rating"><div><b>${fmt(p.ratings.scope)}</b><small>SCOPE</small></div><div><b>${p.ratings.impactPerRound > 0 ? "+" : ""}${fmt(p.ratings.impactPerRound, 1)}</b><small>IMPACT %</small></div><div><b>${p.ratings.mechanics ?? "–"}</b><small>MECH</small></div><div><b>${p.ratings.decisions}</b><small>DECISIONS</small></div></div>
  ${bar("Crosshair placement", scale(m.crosshair, 2, 15), m.crosshair === null ? "needs .dem" : `${fmt(m.crosshair, 1)}° (${m.crosshairSamples})`)}
  ${bar("Reaction (spot → shot)", scale(m.reactionMs, 150, 500), m.reactionMs === null ? "needs .dem" : `${Math.round(m.reactionMs)} ms`)}
  ${bar("Time to damage", scale(m.timeToDamageMs, 220, 750), m.timeToDamageMs === null ? "needs .dem" : `${Math.round(m.timeToDamageMs)} ms`)}
  ${bar("Counter-strafed shots", scale(m.strafe, 0.85, 0.35), m.strafe === null ? "–" : `${pct(m.strafe)} of ${m.strafeShots}`)}
  ${bar("Duel accuracy", scale(m.accuracy, 0.32, 0.12), pct(m.accuracy))}
  ${bar("Headshot kills", scale(m.headshot, 0.55, 0.15), pct(m.headshot))}
  ${bar("Duels won", scale(m.duelWinRate, 0.62, 0.38), m.duelWinRate === null ? "–" : `${m.duelsWon}/${m.duels}`)}
  <div class="kv"><span>HLTV 1.0 / 2.0≈</span><span>${fmt(p.ratings.hltv1)} / ${fmt(p.ratings.hltv2)}</span><span>K / D / A</span><span>${p.stats.kills} / ${p.stats.deaths} / ${p.stats.assists}</span><span>ADR · KAST</span><span>${fmt(p.stats.adr, 0)} · ${pct(p.stats.kast)}</span><span>Opening K–D</span><span>${p.stats.openingKills}–${p.stats.openingDeaths}</span><span>Trade kills · traded deaths</span><span>${p.stats.tradeKills} · ${p.stats.tradedDeaths}</span><span>Multi-kills (2k/3k/4k/5k)</span><span>${p.stats.multi.join("/")}</span><span>Utility damage</span><span>${p.stats.utilDamage ?? "–"}</span><span>Enemy / team flash time</span><span>${p.stats.enemyFlashSeconds}s / ${p.stats.teamFlashSeconds}s</span><span>Mistakes · highlights</span><span>${p.findings.mistakes} · ${p.findings.highlights}</span></div>`;
}
function hud(players) {
  const r = S.replay.rounds[S.round], f = players.find(p => p.id === S.focus), rate = S.replay.tickRate;
  const wp = S.review.rounds[S.round].winProbability, at = [...wp].reverse().find(p => p.tick <= S.tick) ?? wp[0];
  const team = f?.team ?? 2, mine = team === 2 ? at.t : 1 - at.t;
  let html = `<b>R${r.number}</b> · ${roundClock(r, S.tick, rate)} · <span class="${team === 2 ? "t-text" : "ct-text"}">${team === 2 ? "T" : "CT"} win chance ${Math.round(mine * 100)}%</span>`;
  if (f) {
    const speed = Number.isFinite(f.vx) ? Math.round(Math.hypot(f.vx, f.vy)) : null;
    html += `<br><b>${esc(nameOf(f.id))}</b> · ${f.alive !== false && f.hp > 0 ? `${f.hp} HP` : "dead"}${f.weapon ? " · " + esc(f.weapon) : ""}${speed !== null ? ` · ${speed} u/s` : ""}`;
    if (f.seenBy) html += `<br><span class="muted">Spotted by:</span> ${f.seenBy.map(id => esc(nameOf(id))).join(", ") || "nobody"}`;
    const sees = players.filter(p => p.seenBy?.includes(f.id)).map(p => esc(nameOf(p.id)));
    if (f.seenBy) html += `<br><span class="muted">Sees:</span> ${sees.join(", ") || "nobody"}`;
  }
  $("hud").innerHTML = html;
}
function drawTimeline() {
  const c = $("timeline"), w = c.clientWidth, h = 54, g = c.getContext("2d");
  if (c.width !== w * devicePixelRatio) { c.width = w * devicePixelRatio; c.height = h * devicePixelRatio; }
  g.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0); g.clearRect(0, 0, w, h);
  if (!S.replay) return;
  const x = t => 6 + (t - S.start) / Math.max(1, S.end - S.start) * (w - 12);
  g.fillStyle = "#1f262e"; g.fillRect(6, 8, w - 12, 30);
  const f = sample(S.round, S.tick).find(p => p.id === S.focus), team = f?.team ?? 2;
  const wp = S.review.rounds[S.round].winProbability;
  g.strokeStyle = team === 2 ? "#edb65d" : "#70b9e9"; g.lineWidth = 1.5; g.beginPath();
  let prev = wp[0];
  const y = p => 38 - (team === 2 ? p.t : 1 - p.t) * 30;
  g.moveTo(6, y(prev));
  for (const p of wp.slice(1)) { if (p.tick < S.start) { prev = p; g.moveTo(6, y(p)); continue; } if (p.tick > S.end) break; g.lineTo(x(p.tick), y(prev)); g.lineTo(x(p.tick), y(p)); prev = p; }
  g.lineTo(w - 6, y(prev)); g.stroke();
  g.fillStyle = "#8a959f"; g.font = "9px Segoe UI"; g.fillText("win %", 9, 18);
  for (const e of S.replay.rounds[S.round].events) if (e.event_name === "player_death" && e.tick >= S.start && e.tick <= S.end) { g.fillStyle = Number(e.user_team_num) === 2 ? "#edb65d" : "#70b9e9"; g.fillRect(x(e.tick) - 1, 40, 2, 5); }
  for (const n of notes()) if (n.tick >= S.start && n.tick <= S.end) { g.fillStyle = n.kind === "highlight" ? "#7fcf9a" : "#f07a6a"; g.beginPath(); g.arc(x(n.tick), 49, 3.5, 0, 7); g.fill(); }
  g.fillStyle = "#fff"; g.fillRect(x(S.tick) - 1, 4, 2, 48);
}
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (S.replay) {
    if (S.playing) {
      S.tick += dt * S.replay.tickRate * S.speed;
      const list = notes(), next = list.findIndex((n, i) => i > S.lastNote && n.tick <= S.tick);
      if (next >= 0) {
        S.lastNote = next; const n = list[next], pop = $("note-pop");
        pop.className = "note-pop " + n.kind; pop.innerHTML = `<b>${esc(n.title)}</b>${esc(n.detail)}${n.tip ? `<br><span class="muted">→ ${esc(n.tip)}</span>` : ""}`; pop.hidden = false;
        document.querySelectorAll(".note").forEach((b, i) => b.classList.toggle("active", i === next));
        if ($("pause-notes").checked) setPlaying(false);
      }
      if (S.tick >= S.end) { S.tick = S.end; setPlaying(false); }
    }
    const round = S.replay.rounds[S.round], players = sample(S.round, S.tick);
    const related = new Set(S.clip ? S.clip.notes.flatMap(n => n.related) : []);
    const deaths = round.events.filter(e => e.event_name === "player_death" && e.tick <= S.tick && Number.isFinite(e.user_X)).map(e => ({x: e.user_X, y: e.user_Y, z: e.user_Z ?? 0}));
    scene.update({players, focus: S.focus, related, tick: S.tick, shots: shotsNear(S.round, S.tick), effects: activeEffects(round, S.tick), deaths, allViews: $("show-all-views").checked});
    hud(players);
    $("clock").textContent = `${roundClock(round, S.tick, S.replay.tickRate)} · R${round.number}`;
    $("stage-title").textContent = S.clip ? `${S.clip.title} — ${nameOf(S.clip.player)}` : `Round ${round.number} — following ${nameOf(S.focus)}`;
    drawTimeline();
  }
  scene.render();
  requestAnimationFrame(frame);
}

// ---------- events ----------
$("demo-file").onchange = e => { openFile(e.target.files[0]); e.target.value = ""; };
$("load-sample").onclick = async () => { try { loading(true, "Opening the public Mirage sample", 30); const r = await fetch("../sample.strats"); await use(validateReplay(await decode(await r.arrayBuffer())), null, "Public sample — Mirage"); } catch (e) { loading(false); toast(e.message); } };
$("help-button").onclick = () => $("help").showModal();
$("play").onclick = () => setPlaying(!S.playing);
$("prev-note").onclick = () => jumpNote(-1);
$("next-note").onclick = () => jumpNote(1);
document.querySelectorAll("[data-speed]").forEach(b => b.onclick = () => { S.speed = Number(b.dataset.speed); document.querySelectorAll("[data-speed]").forEach(x => x.classList.toggle("selected", x === b)); });
document.querySelectorAll("[data-cam]").forEach(b => b.onclick = () => { scene.mode = b.dataset.cam; scene.follow = true; document.querySelectorAll("[data-cam]").forEach(x => x.classList.toggle("selected", x === b)); });
document.querySelectorAll("[data-tab]").forEach(b => b.onclick = () => { document.querySelectorAll("[data-tab]").forEach(x => x.classList.toggle("selected", x === b)); for (const t of ["clips", "ratings", "rounds"]) $("tab-" + t).hidden = t !== b.dataset.tab; });
document.querySelectorAll("[data-kind]").forEach(b => b.onclick = () => { S.kind = b.dataset.kind; document.querySelectorAll("[data-kind]").forEach(x => x.classList.toggle("selected", x === b)); renderLists(); });
$("clip-player").onchange = e => { S.player = e.target.value; if (S.player) { S.focus = S.player; renderPlayer(); } renderLists(); };
$("clip-list").onclick = e => { const b = e.target.closest("[data-clip]"); if (b) openClip(S.review.clips.find(c => c.id === b.dataset.clip)); };
$("rating-table").onclick = e => { const r = e.target.closest("[data-player]"); if (!r) return; S.focus = S.player = r.dataset.player; $("clip-player").value = S.player; renderPlayer(); renderLists(); if (!S.clip) renderCritique(); };
$("round-list").onclick = e => { const b = e.target.closest("[data-round]"); if (b) openRound(Number(b.dataset.round)); };
$("critique").onclick = e => { const b = e.target.closest("[data-note]"); if (!b) return; const n = notes()[Number(b.dataset.note)]; seek(n.tick - S.replay.tickRate * 2); setPlaying(true); };
$("timeline").onclick = e => { const r = e.target.getBoundingClientRect(); seek(S.start + (e.clientX - r.left - 6) / (r.width - 12) * (S.end - S.start)); };
$("save-review").onclick = async () => {
  try {
    const blob = new Blob([JSON.stringify({format: "strat-scope-review", version: 1, replay: S.replay, detail: S.detail})]);
    const gz = await new Response(blob.stream().pipeThrough(new CompressionStream("gzip"))).blob();
    const a = document.createElement("a"); a.href = URL.createObjectURL(gz); a.download = S.replay.source.replace(/\.(dem|strats|json|scopereview)$/i, "") + ".scopereview"; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000); toast("Review saved. Open it here later without re-parsing.", 3000);
  } catch (e) { toast("Save failed: " + e.message); }
};
addEventListener("keydown", e => {
  if (e.target.closest("input,select,textarea")) return;
  if (e.code === "Space") { e.preventDefault(); setPlaying(!S.playing); }
  else if (e.key === "[") jumpNote(-1); else if (e.key === "]") jumpNote(1);
  else if (e.key === "ArrowLeft") seek(S.tick - S.replay?.tickRate * 2); else if (e.key === "ArrowRight") seek(S.tick + S.replay?.tickRate * 2);
});
addEventListener("dragover", e => e.preventDefault());
addEventListener("drop", e => { e.preventDefault(); openFile(e.dataTransfer.files[0]); });
try { mapDefs = await (await fetch("../maps/maps.json")).json(); } catch { toast("Map definitions unavailable."); }
requestAnimationFrame(frame);
