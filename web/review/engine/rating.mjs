// Box-score stats, public HLTV 1.0 formula, community HLTV 2.0 approximation,
// win-probability impact (WPA) and the composite Scope Rating.
import {frameBefore, isGun, clamp, round2, postRoundEnd} from "./util.mjs";

const TRADE_SECONDS = 5;
export function teamOf(round, id) { return frameBefore(round.frames, round.live)?.players.find(p => p.id === id)?.team ?? null; }

export function boxScore(replay, detail) {
  const rate = replay.tickRate, stats = new Map();
  const get = id => { id = String(id); if (!stats.has(id)) stats.set(id, {id, rounds: 0, kills: 0, deaths: 0, assists: 0, hsKills: 0, damage: 0, utilDamage: 0, kastRounds: 0, multi: [0, 0, 0, 0, 0, 0], openingKills: 0, openingDeaths: 0, tradeKills: 0, tradedDeaths: 0, enemyFlashSeconds: 0, teamFlashSeconds: 0, flashAssists: 0, survived: 0}); return stats.get(id); };
  replay.rounds.forEach((round, index) => {
    const roster = (frameBefore(round.frames, round.live)?.players ?? []).filter(p => p.team === 2 || p.team === 3);
    // Exit frags after round_end count on the official scoreboard (core keeps them in postRoundEvents).
    const deaths = [...round.events, ...(round.postRoundEvents ?? [])].filter(e => e.event_name === "player_death" && e.tick >= round.live && e.tick <= postRoundEnd(round, rate, index === replay.rounds.length - 1));
    const kast = new Set(), kills = new Map();
    for (const p of roster) get(p.id).rounds++;
    deaths.forEach((d, n) => {
      const v = String(d.user_steamid), k = d.attacker_steamid ? String(d.attacker_steamid) : null;
      get(v).deaths++;
      const enemyKill = k && k !== v && d.attacker_team_num !== d.user_team_num;
      if (enemyKill) {
        const s = get(k); s.kills++; if (d.headshot) s.hsKills++; kast.add(k); kills.set(k, (kills.get(k) ?? 0) + 1);
        if (n === 0) { s.openingKills++; get(v).openingDeaths++; }
        const avenged = deaths.some(x => String(x.attacker_steamid) === v && x.tick < d.tick && x.tick >= d.tick - TRADE_SECONDS * rate && x.user_team_num === d.attacker_team_num);
        if (avenged) s.tradeKills++;
      }
      if (d.assister_steamid && d.assister_team_num !== d.user_team_num) { get(d.assister_steamid).assists++; kast.add(String(d.assister_steamid)); if (d.assistedflash) get(d.assister_steamid).flashAssists++; }
      const traded = k && deaths.some(x => String(x.user_steamid) === k && x.tick > d.tick && x.tick <= d.tick + TRADE_SECONDS * rate);
      if (traded) { get(v).tradedDeaths++; kast.add(v); }
    });
    const dead = new Set(deaths.map(d => String(d.user_steamid)));
    for (const p of roster) if (!dead.has(p.id)) { kast.add(p.id); get(p.id).survived++; }
    for (const id of kast) get(id).kastRounds++;
    for (const [id, n] of kills) get(id).multi[Math.min(5, n)]++;
    for (const b of round.events) {
      if (b.event_name !== "player_blind" || !b.attacker_steamid || String(b.attacker_steamid) === String(b.user_steamid) || !Number.isFinite(b.blind_duration)) continue;
      if (b.attacker_team_num === b.user_team_num) get(b.attacker_steamid).teamFlashSeconds += b.blind_duration; else get(b.attacker_steamid).enemyFlashSeconds += b.blind_duration;
    }
  });
  // Damage needs player_hurt; cap each hit at the victim's remaining health.
  if (detail?.hurts) {
    const hp = new Map();
    for (const h of detail.hurts) {
      const k = h.round + "|" + h.victim, before = hp.get(k) ?? 100, dealt = Math.min(h.dmg, before);
      hp.set(k, Math.max(0, h.hp));
      if (!h.attacker || h.attacker === h.victim || h.sameTeam) continue;
      const s = get(h.attacker); s.damage += dealt;
      if (!isGun(h.weapon) && /(hegrenade|inferno|molotov|incgrenade)/i.test(h.weapon)) s.utilDamage += dealt;
    }
  }
  for (const s of stats.values()) {
    const r = Math.max(1, s.rounds);
    s.kpr = s.kills / r; s.dpr = s.deaths / r; s.apr = s.assists / r; s.kast = s.kastRounds / r;
    s.adr = detail?.hurts ? s.damage / r : null;
    s.hs = s.kills ? s.hsKills / s.kills : null;
    s.rating1 = ((s.kpr / 0.679) + 0.7 * ((r - s.deaths) / r / 0.317) + ((s.multi[1] + 4 * s.multi[2] + 9 * s.multi[3] + 16 * s.multi[4] + 25 * s.multi[5]) / r / 1.277)) / 2.7;
    const impact = 2.13 * s.kpr + 0.42 * s.apr - 0.41;
    s.rating2 = s.adr === null ? null : 0.0073 * s.kast * 100 + 0.3591 * s.kpr - 0.5329 * s.dpr + 0.2372 * impact + 0.0032 * s.adr + 0.1587;
  }
  return stats;
}

// Credits each win-probability swing to the players who caused it.
export function impactCredit(replay, detail, timelines) {
  const credit = new Map(), add = (id, v, round) => { if (!id) return; id = String(id); const c = credit.get(id) ?? {total: 0, byRound: {}}; c.total += v; c.byRound[round] = (c.byRound[round] ?? 0) + v; credit.set(id, c); };
  const rate = replay.tickRate;
  timelines.forEach((tl, index) => {
    const round = replay.rounds[index];
    const hurts = detail?.hurts?.filter(h => h.round === index) ?? [];
    const deaths = round.events.filter(e => e.event_name === "player_death");
    for (const pt of tl.points) {
      const e = pt.event, tGain = pt.after - pt.before;
      if (e.event_name === "player_death") {
        const vTeam = e.user_team_num, swing = Math.abs(tGain);
        const killer = e.attacker_steamid && e.attacker_team_num !== vTeam ? String(e.attacker_steamid) : null;
        const traded = killer && deaths.some(x => String(x.user_steamid) === killer && x.tick > e.tick && x.tick <= e.tick + TRADE_SECONDS * rate);
        add(e.user_steamid, -swing * (traded ? 0.5 : 1), index);
        if (!killer) continue;
        const dmg = new Map();
        for (const h of hurts) if (h.victim === String(e.user_steamid) && h.tick <= e.tick && h.attacker && !h.sameTeam && h.attacker !== h.victim) dmg.set(h.attacker, (dmg.get(h.attacker) ?? 0) + h.dmg);
        const total = [...dmg.values()].reduce((a, b) => a + b, 0);
        if (total > 0) { add(killer, swing * 0.5, index); for (const [id, d] of dmg) add(id, swing * 0.5 * d / total, index); }
        else if (e.assister_steamid && e.assister_team_num !== vTeam) { add(killer, swing * 0.8, index); add(e.assister_steamid, swing * 0.2, index); }
        else add(killer, swing, index);
      } else if (e.event_name === "bomb_planted" || e.event_name === "bomb_defused") add(e.user_steamid, Math.abs(tGain), index);
    }
  });
  return credit;
}

export function decisionScore(findings, rounds) {
  const weight = {1: 3, 2: 6, 3: 10};
  const penalty = findings.filter(f => f.kind === "mistake").reduce((s, f) => s + weight[f.severity], 0) / Math.max(1, rounds);
  const bonus = findings.filter(f => f.kind === "highlight" && !f.duel).reduce((s, f) => s + f.severity, 0) / Math.max(1, rounds);
  return Math.round(clamp(100 * Math.exp(-penalty / 12) + bonus * 4, 0, 100));
}

export function scopeRating({rating1, rating2, impactPerRound, mechanics, decisions}) {
  const parts = [[rating2 ?? rating1, 0.45], [1 + impactPerRound * 4, 0.35], [mechanics === null ? null : mechanics / 50, 0.1], [decisions === null ? null : decisions / 50, 0.1]].filter(([v]) => Number.isFinite(v));
  const w = parts.reduce((s, [, x]) => s + x, 0);
  return round2(Math.max(0, parts.reduce((s, [v, x]) => s + v * x, 0) / w));
}
