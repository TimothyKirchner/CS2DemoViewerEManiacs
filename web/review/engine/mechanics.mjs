// Duels and aim/movement mechanics. Spot-based measures need review detail (pitch + approximate_spotted_by);
// coarse replays fall back to clearly flagged yaw-only proxies.
import {aimError, frameBefore, isGun, median, strafeThreshold, clamp, round1} from "./util.mjs";

const SPOT_LOOKBACK = 3, GAP = 3;
// Shots this long before the spot mean the player was already firing; under MIN_HUMAN_MS the spot flag lagged.
// Spot-based values need MIN_SAMPLES clean duels before a match median is reported.
export const PREFIRE_SECONDS = 0.6, MIN_HUMAN_MS = 100, MIN_SAMPLES = 5;

export function roundShots(round, detail, index) {
  if (detail?.shots) return detail.shots.filter(s => s.round === index);
  return round.events.filter(e => e.event_name === "weapon_fire").map(e => ({tick: e.tick, id: String(e.user_steamid), weapon: String(e.weapon ?? ""), x: e.user_X, y: e.user_Y, z: e.user_Z, yaw: e.user_yaw, pitch: null, speed: null}));
}
export function roundHurts(detail, index) { return detail?.hurts ? detail.hurts.filter(h => h.round === index) : []; }

// Horizontal speed from the recorded frames around a tick (coarse fallback).
export function speedAt(frames, id, tick, rate) {
  const a = frameBefore(frames, tick), i = frames.indexOf(a), b = frames[i + 1];
  const pa = a?.players.find(p => p.id === id), pb = b?.players.find(p => p.id === id);
  if (pa && Number.isFinite(pa.vx)) return Math.hypot(pa.vx, pa.vy);
  if (!pa || !pb || b.tick === a.tick) return null;
  return Math.hypot(pb.x - pa.x, pb.y - pa.y) / ((b.tick - a.tick) / rate);
}

export function buildDuels(replay, detail) {
  const rate = replay.tickRate, out = [];
  replay.rounds.forEach((round, index) => {
    const team = new Map((frameBefore(round.frames, round.live)?.players ?? []).map(p => [p.id, p.team]));
    const contacts = roundHurts(detail, index).filter(h => h.attacker && h.attacker !== h.victim && isGun(h.weapon)).map(h => ({tick: h.tick, from: h.attacker, to: h.victim, dmg: h.dmg, head: h.hitgroup === "head", kill: h.hp <= 0}));
    const deaths = round.events.filter(e => e.event_name === "player_death" && e.attacker_steamid && String(e.attacker_steamid) !== String(e.user_steamid));
    for (const d of deaths) {
      const from = String(d.attacker_steamid), to = String(d.user_steamid);
      if (!contacts.some(c => c.from === from && c.to === to && c.kill && Math.abs(c.tick - d.tick) <= rate / 4)) contacts.push({tick: d.tick, from, to, dmg: d.dmg_health ?? null, head: Boolean(d.headshot), kill: true, deathOnly: true, weapon: d.weapon});
    }
    contacts.sort((a, b) => a.tick - b.tick);
    const open = new Map();
    for (const c of contacts) {
      if (team.get(c.from) && team.get(c.from) === team.get(c.to)) continue;
      const pair = [c.from, c.to].sort().join("|");
      let duel = open.get(pair);
      if (!duel || c.tick - duel.end > GAP * rate || duel.victim) {
        duel = {round: index, a: c.from, b: c.to, start: c.tick, end: c.tick, contacts: [], victim: null, killer: null};
        open.set(pair, duel); out.push(duel);
      }
      duel.end = c.tick; duel.contacts.push(c);
      if (c.kill) { duel.victim = c.to; duel.killer = c.from; }
    }
  });
  for (const d of out) {
    const dmg = id => d.contacts.filter(c => c.from === id).reduce((s, c) => s + (c.dmg ?? 0), 0);
    d.winner = d.killer ?? (dmg(d.a) === dmg(d.b) ? null : dmg(d.a) > dmg(d.b) ? d.a : d.b);
    d.opener = d.contacts[0].from;
  }
  return out;
}

// Start of the continuous run in which `target` was spotted by `viewer`, ending at `tick`.
function spotStart(frames, viewer, target, tick, rate) {
  const end = frames.indexOf(frameBefore(frames, tick)), limit = tick - SPOT_LOOKBACK * rate;
  let first = null, misses = 0;
  for (let i = end; i >= 0 && frames[i].tick >= limit; i--) {
    const t = frames[i].players.find(p => p.id === target);
    if (!t?.seenBy) return {tick: null};
    if (t.seenBy.includes(viewer)) { first = frames[i].tick; misses = 0; }
    else if (first !== null) { if (++misses > 2) break; }
    else if (tick - frames[i].tick > rate * 0.4) break; // spotting must be current at first contact
  }
  if (first === null) return {tick: null};
  const earliest = frames.find(f => f.tick >= limit);
  return {tick: first, censored: earliest && first <= earliest.tick};
}

export function duelMechanics(replay, detail, duel) {
  const round = replay.rounds[duel.round], rate = replay.tickRate;
  const frames = detail?.fine?.[duel.round]?.length ? detail.fine[duel.round] : round.frames;
  const spotted = Boolean(detail?.coverage?.spotted && detail.fine?.[duel.round]?.length);
  const shots = roundShots(round, detail, duel.round);
  const side = (me, them) => {
    const r = {player: me, enemy: them, won: duel.winner === me, decided: duel.winner !== null, opened: duel.opener === me};
    let ref = null;
    if (spotted) {
      const s = spotStart(frames, me, them, duel.start, rate);
      if (s.tick !== null && !s.censored) { ref = s.tick; r.spotTick = s.tick; }
    }
    // Already firing (spray, prefire, spam) when the enemy got spotted: the next bullet is not a reaction,
    // and the crosshair is already on them. Such duels are left out of reaction, time-to-damage and placement.
    if (ref !== null && shots.some(s => s.id === me && isGun(s.weapon) && s.tick < ref && s.tick >= ref - PREFIRE_SECONDS * rate)) {
      r.prefire = true; ref = null;
    }
    const ms = t => Math.round((t - ref) / rate * 1000);
    const shot = ref === null ? null : shots.find(s => s.id === me && s.tick >= ref && s.tick <= duel.end && isGun(s.weapon));
    // Faster than a human can react means the spotted flag lagged real visibility: no usable start time,
    // and the crosshair at that moment was already on the enemy.
    if (shot && ms(shot.tick) < MIN_HUMAN_MS) { r.spotLag = true; ref = null; }
    if (ref !== null) {
      const a = frameBefore(frames, ref), p = a.players.find(x => x.id === me), q = a.players.find(x => x.id === them);
      if (p && q) { const e = aimError(p, q); r.crosshair = round1(e.total); r.crosshairPitch = round1(e.pitch); r.distance = Math.round(e.distance); }
      if (shot) r.reactionMs = ms(shot.tick);
      const hit = duel.contacts.find(c => c.from === me && !c.deathOnly);
      if (hit && hit.tick >= ref && ms(hit.tick) >= MIN_HUMAN_MS) r.timeToDamageMs = ms(hit.tick);
    }
    const from = (ref ?? duel.start - rate) - 2, mine = shots.filter(s => s.id === me && s.tick >= from && s.tick <= duel.end && isGun(s.weapon));
    r.shots = mine.length;
    r.hits = duel.contacts.filter(c => c.from === me && !c.deathOnly).length;
    const strafable = mine.filter(s => strafeThreshold(s.weapon) !== null).map(s => ({...s, speed: s.speed ?? speedAt(round.frames, me, s.tick, rate)})).filter(s => Number.isFinite(s.speed));
    r.strafeShots = strafable.length;
    r.strafedShots = strafable.filter(s => s.speed <= strafeThreshold(s.weapon)).length;
    r.firstShotSpeed = strafable[0] ? Math.round(strafable[0].speed) : null;
    r.firstShotWeapon = strafable[0]?.weapon ?? mine[0]?.weapon ?? null;
    r.damage = duel.contacts.filter(c => c.from === me).reduce((s, c) => s + (c.dmg ?? 0), 0);
    return r;
  };
  return [side(duel.a, duel.b), side(duel.b, duel.a)];
}

// Local benchmark ranges: [excellent, poor]. Linear in between, clamped to 0..100.
export const BENCHMARKS = {crosshair: [2, 15], reactionMs: [150, 500], timeToDamageMs: [220, 750], strafe: [0.85, 0.35], accuracy: [0.32, 0.12], headshot: [0.55, 0.15], duelWin: [0.62, 0.38]};
const score = (v, [good, bad]) => v === null || v === undefined ? null : clamp((v - bad) / (good - bad) * 100, 0, 100);

export function summarizeMechanics(entries, {kills = 0, hsKills = 0, gunHurts = [], allShots = 0} = {}) {
  const pick = k => entries.map(e => e[k]).filter(Number.isFinite);
  const spotMedian = k => pick(k).length >= MIN_SAMPLES ? median(pick(k)) : null;
  const strafeShots = entries.reduce((s, e) => s + e.strafeShots, 0), strafed = entries.reduce((s, e) => s + e.strafedShots, 0);
  const duelShots = entries.reduce((s, e) => s + e.shots, 0), hits = entries.reduce((s, e) => s + e.hits, 0);
  const decided = entries.filter(e => e.decided);
  const m = {
    duels: entries.length, duelsWon: entries.filter(e => e.won).length,
    duelWinRate: decided.length ? entries.filter(e => e.won).length / decided.length : null,
    crosshair: spotMedian("crosshair"), crosshairSamples: pick("crosshair").length,
    reactionMs: spotMedian("reactionMs"), reactionSamples: pick("reactionMs").length,
    timeToDamageMs: spotMedian("timeToDamageMs"),
    prefireDuels: entries.filter(e => e.prefire).length, spotLagDuels: entries.filter(e => e.spotLag).length,
    strafe: strafeShots >= 5 ? strafed / strafeShots : null, strafeShots,
    accuracy: gunHurts.length && duelShots >= 10 ? hits / duelShots : null, shots: allShots,
    headshot: kills >= 3 ? hsKills / kills : null,
    headHitShare: gunHurts.length >= 8 ? gunHurts.filter(h => h.hitgroup === "head").length / gunHurts.length : null
  };
  const parts = [
    ["crosshair", m.crosshairSamples >= 3 ? m.crosshair : null, 2],
    ["reactionMs", m.reactionMs, 1.5], ["timeToDamageMs", m.timeToDamageMs, 1], ["strafe", m.strafe, 1.5],
    ["accuracy", m.accuracy, 1], ["headshot", m.headshot, 1], ["duelWin", m.duels >= 4 ? m.duelWinRate : null, 1.5]
  ].map(([k, v, w]) => [score(v, BENCHMARKS[k]), w]).filter(([s]) => s !== null);
  const weight = parts.reduce((s, [, w]) => s + w, 0);
  m.score = weight >= 3 ? Math.round(parts.reduce((s, [v, w]) => s + v * w, 0) / weight) : null;
  m.components = parts.length;
  return m;
}
