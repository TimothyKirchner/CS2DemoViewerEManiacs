// Decision-making heuristics. Every finding cites its tick, players and the measured evidence.
import {dist, frameBefore, grenadeCount, primaryValue, clock, NON_GUN, winnerTeam} from "./util.mjs";

const TRADE_SECONDS = 5, TRADE_RANGE = 700, SEEN_TRADE_RANGE = 1400, ISOLATION = 1150, FLASH_SUPPORT = 4;
const sev = {low: 1, medium: 2, high: 3};

function aliveAt(round, tick, dead) {
  return (frameBefore(round.frames, tick)?.players ?? []).filter(p => !dead.has(p.id) && p.alive !== false && (p.team === 2 || p.team === 3));
}

// ctx: {replay, detail, index, timeline: roundTimeline result, duels (this round), mech (Map duel->[side,side])}
export function roundDecisions(ctx) {
  const {replay, detail, index, timeline} = ctx, round = replay.rounds[index], rate = replay.tickRate, out = [];
  const add = m => out.push({round: index, roundNumber: round.number, clock: clock(round, m.tick, rate), ...m});
  const deaths = round.events.filter(e => e.event_name === "player_death");
  const hurts = detail?.hurts?.filter(h => h.round === index) ?? [];
  const blinds = round.events.filter(e => e.event_name === "player_blind");
  const flashes = round.events.filter(e => e.event_name === "flashbang_detonate" || e.event_name === "smokegrenade_detonate");
  const dead = new Set(), swing = new Map(timeline.points.map(p => [p.event, p]));
  const fine = detail?.fine?.[index];
  deaths.forEach((d, n) => {
    const victim = String(d.user_steamid), killer = d.attacker_steamid ? String(d.attacker_steamid) : null;
    const living = aliveAt(round, d.tick - 1, dead);
    dead.add(victim);
    const v = living.find(p => p.id === victim), k = living.find(p => p.id === killer);
    if (!v) return;
    const mates = living.filter(p => p.team === v.team && p.id !== victim);
    const nearest = mates.map(p => ({p, d: dist(p, v)})).sort((a, b) => a.d - b.d)[0];
    const traded = killer && deaths.some(x => String(x.user_steamid) === killer && x.tick > d.tick && x.tick <= d.tick + TRADE_SECONDS * rate && x.attacker_team_num === v.team);
    const elapsed = (d.tick - round.live) / rate, sp = swing.get(d);
    const teamP = sp ? (v.team === 2 ? sp.before : 1 - sp.before) : null;
    const base = {player: victim, tick: d.tick, related: [killer].filter(Boolean)};
    if (d.tick < round.live || !killer || killer === victim) return;
    // Opening death without utility support.
    if (n === 0 && elapsed > 3) {
      const support = flashes.some(f => f.tick <= d.tick && f.tick >= d.tick - FLASH_SUPPORT * rate && f.user_team_num === v.team && Math.hypot(f.x - v.x, f.y - v.y) < 1600);
      if (!support) add({...base, kind: "mistake", type: "dry-opening", severity: sev.medium, title: "Lost the opening duel without utility", detail: `First death of the round at ${clock(round, d.tick, rate)} with no team flash or smoke within ${FLASH_SUPPORT}s nearby. Opening deaths cost about ${Math.round(Math.abs((sp?.after ?? 0) - (sp?.before ?? 0)) * 100)}% round win chance here.`});
    }
    // CT anchors often hold alone by design, so their isolated deaths are rated lower.
    if (!traded && nearest && nearest.d > ISOLATION && elapsed > 8) add({...base, kind: "mistake", type: "isolated", severity: v.team === 3 ? sev.low : nearest.d > 2000 ? sev.high : sev.medium, title: "Isolated, untraded death", detail: `Nearest teammate (${name(replay, nearest.p.id)}) was ${Math.round(nearest.d)} units away, too far to trade.${v.team === 3 ? " On a solo CT position, play for information and fall back instead of taking the duel." : ""}`});
    if (!traded && killer && k) {
      for (const m of mates) {
        // With spotting detail a trade needs line of sight to the killer; otherwise use a tight distance.
        const range = dist(m, v), saw = fine?.length ? sawWithin(fine, m.id, killer, d.tick, d.tick + TRADE_SECONDS * rate) : null;
        if (!hasGun(m) || (saw === null ? range > TRADE_RANGE : !saw || range > SEEN_TRADE_RANGE)) continue;
        const tried = hurts.some(h => h.attacker === m.id && h.victim === killer && h.tick >= d.tick && h.tick <= d.tick + TRADE_SECONDS * rate);
        const diedSoon = deaths.some(x => String(x.user_steamid) === m.id && x.tick > d.tick && x.tick <= d.tick + 2 * rate);
        if (!tried && !diedSoon) add({player: m.id, tick: d.tick, related: [victim, killer], kind: "mistake", type: "no-trade", severity: sev.medium, title: "Teammate not traded", detail: `${name(replay, victim)} died ${Math.round(range)} units from you to ${name(replay, killer)}${saw ? " (you had them spotted)" : ""}; no trade attempt${hurts.length ? " (no damage dealt)" : ""} within ${TRADE_SECONDS}s.`});
      }
    }
    const nades = grenadeCount(v);
    if (nades >= 2 && elapsed > 20) add({...base, kind: "mistake", type: "unused-utility", severity: nades >= 3 ? sev.medium : sev.low, title: `Died with ${nades} unused grenades`, detail: "Utility left in the inventory at death is value the team never received."});
    // Fighting a nearly lost round with an expensive weapon.
    const gunValue = primaryValue(v);
    if (teamP !== null && teamP < 0.12 && gunValue >= 2700 && elapsed > 25) add({...base, kind: "mistake", type: "no-save", severity: sev.low, title: "Low-percentage fight instead of saving", detail: `Team win chance was ~${Math.round(teamP * 100)}% before this death; the $${gunValue} weapon could have been saved for next round.`});
    // Re-engaging while damaged by the same opponent.
    const earlier = hurts.filter(h => h.victim === victim && h.attacker === killer && h.tick < d.tick - 1.5 * rate && h.tick > d.tick - 8 * rate);
    if (earlier.length && earlier[0].hp > 0 && earlier[0].hp <= 60) add({...base, kind: "mistake", type: "repeek", severity: sev.medium, title: "Re-peeked the same opponent while damaged", detail: `Already hit to ${earlier[0].hp} HP by ${name(replay, killer)} ${((d.tick - earlier[0].tick) / rate).toFixed(1)}s earlier, then took the fight again.`});
    // Exposure to several enemies (needs spotting detail).
    const vf = fine?.length ? frameBefore(fine, d.tick - Math.round(rate * 0.15))?.players.find(p => p.id === victim) : null;
    const seers = vf?.seenBy?.filter(id => living.some(p => p.id === id && p.team !== v.team)) ?? [];
    if (seers.length >= 2) add({...base, related: seers, kind: "mistake", type: "multi-exposure", severity: sev.medium, title: `Exposed to ${seers.length} enemies at once`, detail: `Spotted by ${seers.map(id => name(replay, id)).join(", ")} just before dying; isolate one angle at a time.`});
    const revenge = traded && deaths.find(x => String(x.user_steamid) === killer && x.tick > d.tick);
    if (revenge?.attacker_steamid) add({player: String(revenge.attacker_steamid), tick: revenge.tick, related: [victim, killer], kind: "highlight", type: "trade", severity: sev.low, title: "Traded a teammate", detail: `Killed ${name(replay, killer)} within ${TRADE_SECONDS}s of ${name(replay, victim)} dying.`});
  });
  // Team flashes.
  for (const b of blinds) {
    if (!b.attacker_steamid || b.attacker_team_num !== b.user_team_num || String(b.attacker_steamid) === String(b.user_steamid) || !(b.blind_duration >= 1.5)) continue;
    const victimDied = deaths.some(d => String(d.user_steamid) === String(b.user_steamid) && d.tick >= b.tick && d.tick <= b.tick + b.blind_duration * rate);
    add({player: String(b.attacker_steamid), tick: b.tick, related: [String(b.user_steamid)], kind: "mistake", type: "team-flash", severity: victimDied ? sev.high : sev.low, title: victimDied ? "Team flash led to a teammate's death" : "Flashed a teammate", detail: `${name(replay, b.user_steamid)} blinded for ${b.blind_duration.toFixed(1)}s${victimDied ? " and died while blind" : ""}.`});
  }
  // Effective flashes: enemy blinded >=1.5s and killed by the flasher's team while blind.
  for (const b of blinds) {
    if (!b.attacker_steamid || b.attacker_team_num === b.user_team_num || !(b.blind_duration >= 1.5)) continue;
    const kill = deaths.find(d => String(d.user_steamid) === String(b.user_steamid) && d.tick >= b.tick && d.tick <= b.tick + b.blind_duration * rate && d.attacker_team_num === b.attacker_team_num);
    if (kill) add({player: String(b.attacker_steamid), tick: b.tick, related: [String(b.user_steamid)], kind: "highlight", type: "flash-assist", severity: sev.low, title: "Flash enabled a kill", detail: `${name(replay, b.user_steamid)} blinded ${b.blind_duration.toFixed(1)}s and killed by ${name(replay, kill.attacker_steamid)}.`});
  }
  multiKillsAndClutches(ctx, deaths, add);
  return out;
}

function multiKillsAndClutches({replay, index, timeline}, deaths, add) {
  const round = replay.rounds[index], rate = replay.tickRate, kills = new Map(), clutched = new Set();
  for (const d of deaths) if (d.attacker_steamid && d.attacker_team_num !== d.user_team_num) { const id = String(d.attacker_steamid); kills.set(id, [...(kills.get(id) ?? []), d]); }
  for (const [id, ks] of kills) if (ks.length >= 3) add({player: id, tick: ks[0].tick, endTick: ks.at(-1).tick, related: ks.map(k => String(k.user_steamid)), kind: "highlight", type: "multikill", severity: ks.length >= 4 ? 3 : 2, title: ks.length === 5 ? "Ace" : `${ks.length}-kill round`, detail: `${ks.length} kills in ${((ks.at(-1).tick - ks[0].tick) / rate).toFixed(1)}s.`});
  // Clutch: last alive player against 2+ enemies whose team won.
  const dead = new Set();
  for (const d of deaths) {
    dead.add(String(d.user_steamid));
    const living = aliveAt(round, d.tick + 1, dead);
    for (const side of [2, 3]) {
      const mine = living.filter(p => p.team === side), theirs = living.filter(p => p.team !== side);
      if (mine.length === 1 && theirs.length >= 2 && winnerTeam(round.winner) === side) {
        const id = mine[0].id;
        if (!clutched.has(id)) { clutched.add(id); add({player: id, tick: d.tick, endTick: round.end, related: theirs.map(p => p.id), kind: "highlight", type: "clutch", severity: theirs.length >= 3 ? 3 : 2, title: `Won a 1v${theirs.length} clutch`, detail: `Last player alive against ${theirs.length} and won the round.`}); }
      }
    }
  }
}
function sawWithin(fine, viewer, target, from, to) {
  return fine.some(f => f.tick >= from && f.tick <= to && f.players.some(p => p.id === target && p.seenBy?.includes(viewer)));
}
const hasGun = p => (Array.isArray(p.inventory) ? p.inventory : []).some(i => !NON_GUN.test(String(i?.name ?? i)));
export function name(replay, id) { return replay.players.find(p => p.id === String(id))?.name ?? String(id); }

// Mechanical critiques for lost/won duels with spot-based evidence.
export function duelFindings(replay, duel, sides) {
  const round = replay.rounds[duel.round], rate = replay.tickRate, out = [];
  for (const s of sides) {
    const base = {round: duel.round, roundNumber: round.number, clock: clock(round, s.spotTick ?? duel.start, rate), player: s.player, tick: s.spotTick ?? duel.start, endTick: duel.end, related: [s.enemy], kind: "mistake", duel: true};
    const lost = duel.winner && !s.won;
    if (lost && s.crosshair > 20 && s.distance > 300) out.push({...base, type: "crosshair", severity: s.crosshair > 40 ? 3 : 2, title: `Crosshair ${Math.round(s.crosshair)}° off when ${name(replay, s.enemy)} appeared`, detail: `Measured from your view to their head at first spot (${s.distance} units). Pre-aim common angles at head height.`});
    if (lost && s.reactionMs > 500) out.push({...base, type: "reaction", severity: 1, title: `Slow first shot (${s.reactionMs} ms)`, detail: `${name(replay, s.enemy)} was spotted ${s.reactionMs} ms before your first shot.`});
    if (lost && s.firstShotSpeed !== null && s.strafeShots >= 2 && s.strafedShots / s.strafeShots < 0.5) out.push({...base, type: "moving-shots", severity: 2, title: "Shot while moving", detail: `${s.strafeShots - s.strafedShots}/${s.strafeShots} shots above accurate speed (first shot at ${s.firstShotSpeed} u/s). Counter-strafe before firing.`});
    if (s.won && s.opened === false && s.crosshair <= 2 && s.reactionMs <= 250) out.push({...base, kind: "highlight", type: "clean-duel", severity: 1, title: "Textbook duel", detail: `Crosshair ${s.crosshair}° from the head on spot, first shot after ${s.reactionMs} ms.`});
  }
  return out;
}
