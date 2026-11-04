// Heuristic round win-probability model used to value every kill, plant and defuse.
// Coefficients are local, inspectable estimates (see web/review/README.md), not fitted to a dataset.
import {ROUND_SECONDS, BOMB_SECONDS, clamp, equipmentValue, frameBefore, winnerTeam} from "./util.mjs";

const logistic = x => 1 / (1 + Math.exp(-x));
// state: {tAlive, ctAlive, planted, secondsLeft, bombSecondsLeft, tEquip, ctEquip, ctKit}
export function tWinProbability(s) {
  const t = s.tAlive, c = s.ctAlive;
  if (s.planted) {
    const defuse = s.ctKit ? 5 : 10, left = s.bombSecondsLeft ?? BOMB_SECONDS;
    if (c <= 0 || left < defuse) return 1;
    if (t <= 0) return left > defuse + 3 ? 0.06 : 0.45;
  } else {
    if (t <= 0) return 0;
    if (c <= 0) return 1;
    if ((s.secondsLeft ?? ROUND_SECONDS) <= 0) return 0;
  }
  let x = 2.5 * (t - c) / Math.sqrt(t + c);
  if (Number.isFinite(s.tEquip) && Number.isFinite(s.ctEquip)) x += clamp((s.tEquip / t - s.ctEquip / c) / 1800, -1.6, 1.6);
  if (s.planted) {
    const spare = (s.bombSecondsLeft ?? BOMB_SECONDS) - (s.ctKit ? 5 : 10);
    x += 0.6 + 2.2 * Math.pow(clamp(1 - spare / 30, 0, 1), 2);
  } else {
    const left = s.secondsLeft ?? ROUND_SECONDS;
    if (left < 35) x -= 2.4 * Math.pow(1 - left / 35, 1.5);
  }
  return clamp(logistic(x), 0.005, 0.995);
}

// Reconstructs the state at a tick from recorded frames and events (alive counts follow deaths exactly).
export function stateAt(round, tick, rate, {deadBefore} = {}) {
  const frame = frameBefore(round.frames, tick);
  const players = frame?.players ?? [];
  const dead = deadBefore ?? new Set(round.events.filter(e => e.event_name === "player_death" && e.tick < tick).map(e => String(e.user_steamid)));
  // Deaths are authoritative; the sampled frame can already show a victim dead at the death tick.
  const spawned = new Set((frameBefore(round.frames, round.live)?.players ?? []).filter(p => p.alive !== false || p.hp > 0).map(p => p.id));
  const alive = players.filter(p => (p.team === 2 || p.team === 3) && !dead.has(p.id) && spawned.has(p.id));
  const plant = round.events.find(e => e.event_name === "bomb_planted" && e.tick <= tick);
  const T = alive.filter(p => p.team === 2), CT = alive.filter(p => p.team === 3);
  return {
    tAlive: T.length, ctAlive: CT.length, planted: Boolean(plant),
    secondsLeft: ROUND_SECONDS - (tick - round.live) / rate,
    bombSecondsLeft: plant ? BOMB_SECONDS - (tick - plant.tick) / rate : null,
    tEquip: T.reduce((s, p) => s + equipmentValue(p), 0), ctEquip: CT.reduce((s, p) => s + equipmentValue(p), 0),
    ctKit: CT.some(p => p.hasDefuser)
  };
}

const SWING_EVENTS = new Set(["player_death", "bomb_planted", "bomb_defused"]);
// Returns [{tick, event, before, after}] in T-win probability terms, plus the opening value.
export function roundTimeline(round, rate) {
  const deaths = new Set(), points = [];
  const startTick = round.live;
  const p0 = tWinProbability(stateAt(round, startTick, rate, {deadBefore: deaths}));
  let last = p0;
  for (const e of round.events) {
    if (!SWING_EVENTS.has(e.event_name) || e.tick < round.live) continue;
    const before = tWinProbability(stateAt(round, e.tick, rate, {deadBefore: new Set(deaths)}));
    if (e.event_name === "player_death") deaths.add(String(e.user_steamid));
    let after;
    if (e.event_name === "bomb_defused") after = 0;
    else after = tWinProbability(stateAt(round, e.tick + 1, rate, {deadBefore: new Set(deaths)}));
    points.push({tick: e.tick, event: e, before, after});
    last = after;
  }
  const result = winnerTeam(round.winner) === 2 ? 1 : winnerTeam(round.winner) === 3 ? 0 : null;
  return {start: p0, points, end: result ?? last};
}
