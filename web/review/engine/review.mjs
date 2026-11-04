// Strat Scope automated review: one entry point from a replay (+ optional review detail) to a report.
import {roundTimeline} from "./win-probability.mjs";
import {buildDuels, duelMechanics, summarizeMechanics, roundShots} from "./mechanics.mjs";
import {roundDecisions, duelFindings, name} from "./decisions.mjs";
import {boxScore, impactCredit, decisionScore, scopeRating, teamOf} from "./rating.mjs";
import {buildClips} from "./clips.mjs";
import {isGun, round1, round2} from "./util.mjs";

export const REVIEW_VERSION = 1;

export function reviewReplay(replay, {detail = replay.detail ?? null, perPlayer = 4} = {}) {
  const coverage = {
    damage: Boolean(detail?.hurts), pitch: Boolean(detail?.coverage?.pitch), spotted: Boolean(detail?.coverage?.spotted),
    velocity: Boolean(detail?.coverage?.velocity), fineStep: detail?.coverage?.fineStep ?? null
  };
  const timelines = replay.rounds.map(r => roundTimeline(r, replay.tickRate));
  const duels = buildDuels(replay, detail);
  const sides = new Map(), findings = [];
  for (const d of duels) {
    const s = duelMechanics(replay, detail, d);
    for (const x of s) sides.set(x.player, [...(sides.get(x.player) ?? []), {...x, round: d.round}]);
    findings.push(...duelFindings(replay, d, s));
  }
  replay.rounds.forEach((_, index) => findings.push(...roundDecisions({replay, detail, index, timeline: timelines[index]})));
  findings.sort((a, b) => a.round - b.round || a.tick - b.tick);
  const box = boxScore(replay, detail), impact = impactCredit(replay, detail, timelines);
  const players = replay.players.map(p => {
    const s = box.get(p.id); if (!s || !s.rounds) return null;
    const mine = findings.filter(f => f.player === p.id);
    const gunHurts = (detail?.hurts ?? []).filter(h => h.attacker === p.id && !h.sameTeam && isGun(h.weapon));
    const shots = replay.rounds.reduce((n, r, i) => n + roundShots(r, detail, i).filter(x => x.id === p.id && isGun(x.weapon)).length, 0);
    const mech = summarizeMechanics(sides.get(p.id) ?? [], {kills: s.kills, hsKills: s.hsKills, gunHurts, allShots: shots});
    const dec = decisionScore(mine, s.rounds);
    const impactPerRound = (impact.get(p.id)?.total ?? 0) / s.rounds;
    const lastTeam = teamOf(replay.rounds.at(-1), p.id);
    return {
      id: p.id, name: p.name, team: lastTeam,
      stats: {rounds: s.rounds, kills: s.kills, deaths: s.deaths, assists: s.assists, adr: round1(s.adr), kast: round2(s.kast), hs: round2(s.hs), openingKills: s.openingKills, openingDeaths: s.openingDeaths, tradeKills: s.tradeKills, tradedDeaths: s.tradedDeaths, multi: s.multi.slice(2), utilDamage: detail?.hurts ? Math.round(s.utilDamage) : null, enemyFlashSeconds: round1(s.enemyFlashSeconds), teamFlashSeconds: round1(s.teamFlashSeconds), flashAssists: s.flashAssists},
      ratings: {hltv1: round2(s.rating1), hltv2: round2(s.rating2), impactPerRound: round1(impactPerRound * 100), mechanics: mech.score, decisions: dec, scope: scopeRating({rating1: s.rating1, rating2: s.rating2, impactPerRound, mechanics: mech.score, decisions: dec})},
      mechanics: mech,
      findings: {mistakes: mine.filter(f => f.kind === "mistake").length, highlights: mine.filter(f => f.kind === "highlight").length, byType: countBy(mine, f => f.type)}
    };
  }).filter(Boolean).sort((a, b) => b.ratings.scope - a.ratings.scope);
  const clips = buildClips(replay, findings, impact, {perPlayer});
  const rounds = replay.rounds.map((r, i) => ({index: i, number: r.number, winner: r.winner, reason: r.reason, winProbability: [{tick: r.live, t: round2(timelines[i].start)}, ...timelines[i].points.map(p => ({tick: p.event.tick, t: round2(p.after), event: p.event.event_name, swing: round2(p.after - p.before), by: p.event.attacker_steamid ? name(replay, p.event.attacker_steamid) : name(replay, p.event.user_steamid), victim: p.event.event_name === "player_death" ? name(replay, p.event.user_steamid) : null}))]}));
  return {version: REVIEW_VERSION, map: replay.map, source: replay.source, tickRate: replay.tickRate, coverage, players, clips, findings, rounds, duels: duels.length};
}
const countBy = (xs, f) => xs.reduce((m, x) => (m[f(x)] = (m[f(x)] ?? 0) + 1, m), {});
