// Second parser pass for the automated review: damage, shot angles/speeds and dense samples around fights.
// The viewer's parse (web/parse-demo.mjs) is reused unchanged for the base replay.
import {plain} from "../core.mjs";

export const DETAIL_VERSION = 1;
const EVENT_PROPS = ["X", "Y", "Z", "yaw", "pitch", "team_num", "velocity_X", "velocity_Y"];
const FINE_PROPS = ["X", "Y", "Z", "yaw", "pitch", "velocity_X", "velocity_Y", "velocity_Z", "health", "is_alive", "team_num", "ducking", "is_scoped", "approximate_spotted_by"];
const LEAD_SECONDS = 3, TAIL_SECONDS = 0.25, STEP = 2;

function roundIndexer(rounds) {
  return tick => { for (let i = 0; i < rounds.length; i++) if (tick >= rounds[i].start && tick <= rounds[i].end) return i; return -1; };
}
const id = v => v === undefined || v === null || String(v) === "0" ? null : String(v);

export function fineTicks(replay, hurts) {
  const rate = replay.tickRate, set = new Set();
  const anchors = [...hurts.map(h => [h.round, h.tick]), ...replay.rounds.flatMap((r, i) => r.events.filter(e => e.event_name === "player_death").map(e => [i, e.tick]))];
  for (const [i, t] of anchors) {
    const r = replay.rounds[i], from = Math.max(r.live, t - LEAD_SECONDS * rate), to = Math.min(r.end, t + TAIL_SECONDS * rate);
    for (let x = Math.ceil(from / STEP) * STEP; x <= to; x += STEP) set.add(x);
  }
  return new Int32Array([...set].sort((a, b) => a - b));
}

function tryParse(attempts) {
  let last;
  for (const [fn, label] of attempts) { try { return {value: fn(), label}; } catch (e) { last = e; } }
  throw last;
}

export function parseReviewDetail(bytes, parser, replay, onProgress = () => {}) {
  const index = roundIndexer(replay.rounds), warnings = [];
  onProgress({stage: "Reading damage and shot angles", pct: 0});
  const evs = tryParse([
    [() => plain(parser.parseEvents(bytes, ["player_hurt", "weapon_fire"], EVENT_PROPS, ["is_warmup_period"])), "full"],
    [() => plain(parser.parseEvents(bytes, ["player_hurt", "weapon_fire"], EVENT_PROPS.slice(0, 6), ["is_warmup_period"])), "no-velocity"]
  ]);
  if (evs.label !== "full") warnings.push("Shot velocities were unavailable; movement accuracy uses sampled positions.");
  const hurts = [], shots = [];
  for (const e of evs.value) {
    if (e.is_warmup_period === true) continue;
    const round = index(e.tick); if (round < 0) continue;
    if (e.event_name === "player_hurt") hurts.push({round, tick: e.tick, victim: id(e.user_steamid), attacker: id(e.attacker_steamid), weapon: String(e.weapon ?? ""), dmg: e.dmg_health ?? 0, armor: e.dmg_armor ?? 0, hitgroup: e.hitgroup ?? "", hp: e.health ?? 0, sameTeam: e.attacker_team_num !== undefined && e.attacker_team_num === e.user_team_num});
    else if (e.event_name === "weapon_fire") shots.push({round, tick: e.tick, id: id(e.user_steamid), weapon: String(e.weapon ?? ""), x: e.user_X, y: e.user_Y, z: e.user_Z, yaw: e.user_yaw, pitch: e.user_pitch ?? null, speed: Number.isFinite(e.user_velocity_X) ? Math.hypot(e.user_velocity_X, e.user_velocity_Y ?? 0) : null});
  }
  hurts.sort((a, b) => a.tick - b.tick); shots.sort((a, b) => a.tick - b.tick);
  const ticks = fineTicks(replay, hurts);
  onProgress({stage: "Sampling fights tick by tick", pct: 30, ticks: ticks.length});
  let rows = [], spotted = false, fineWarning = null;
  if (ticks.length) {
    try {
      const res = tryParse([
        [() => parser.parseTicks(bytes, FINE_PROPS, ticks, undefined, false), "full"],
        [() => parser.parseTicks(bytes, FINE_PROPS.filter(p => p !== "approximate_spotted_by" && p !== "ducking"), ticks, undefined, false), "no-spotting"]
      ]);
      rows = plain(res.value); spotted = res.label === "full";
      if (!spotted) fineWarning = "Spotting data was unavailable; reaction time and crosshair placement are not measured.";
    } catch (e) { fineWarning = "Dense fight samples could not be parsed: " + (e?.message ?? e); }
  }
  if (fineWarning) warnings.push(fineWarning);
  onProgress({stage: "Organizing fight samples", pct: 80});
  const fine = replay.rounds.map(() => new Map());
  for (const r of rows) {
    if (![2, 3].includes(r.team_num) || !Number.isFinite(r.X)) continue;
    const round = index(r.tick), pid = id(r.steamid); if (round < 0 || !pid) continue;
    let f = fine[round].get(r.tick); if (!f) fine[round].set(r.tick, f = {tick: r.tick, players: []});
    f.players.push({id: pid, x: r.X, y: r.Y, z: r.Z ?? 0, yaw: r.yaw ?? 0, pitch: r.pitch ?? 0, vx: r.velocity_X ?? 0, vy: r.velocity_Y ?? 0, vz: r.velocity_Z ?? 0, hp: r.health ?? 0, alive: r.is_alive ?? (r.health > 0), team: r.team_num, duck: Boolean(r.ducking), scoped: Boolean(r.is_scoped), seenBy: spotted ? (r.approximate_spotted_by ?? []).map(String) : undefined});
  }
  const pitch = rows.some(r => Number.isFinite(r.pitch));
  return {
    version: DETAIL_VERSION, hurts, shots, warnings,
    fine: fine.map(m => [...m.values()].sort((a, b) => a.tick - b.tick)),
    coverage: {pitch, spotted: spotted && rows.some(r => (r.approximate_spotted_by ?? []).length), velocity: evs.label === "full", fineStep: STEP, fineTicks: ticks.length}
  };
}
