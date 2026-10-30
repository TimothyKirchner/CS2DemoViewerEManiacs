// One-match summary for a focus player: score, side split, the player's numbers, a scoreboard, how often each
// round situation happened, and the instructive rounds as manual-review notes (demo_gototick commands).
// Consumed by the agent hub's CS2 Coach "Matches" tab; plain JSON, no replay objects.
import {frameBefore, winnerTeam} from "./util.mjs";
import {roundCategories, playerName} from "./instructive.mjs";

export const MATCH_SUMMARY_VERSION = 1;
const MECH_KEYS = ["accuracy", "headshot", "headHitShare", "duelWinRate", "duels", "duelsWon", "reactionMs", "reactionSamples", "timeToDamageMs", "crosshair", "crosshairSamples", "prefireDuels", "spotLagDuels", "strafe", "score"];
const REVIEW_LEAD_SECONDS = 8;  // jump this far before the key moment so the situation is readable

export function matchSummary(replay, review, result) {
  const me = String(result.player.steamId), rate = replay.tickRate;
  const findings = (review?.findings ?? []).filter(f => f.player === me);
  const sides = {T: {won: 0, lost: 0}, CT: {won: 0, lost: 0}}, counts = {};
  let us = 0, them = 0;
  const rounds = replay.rounds.map((r, i) => {
    const self = frameBefore(r.frames, r.live)?.players.find(p => p.id === me);
    const side = self?.team === 2 ? "T" : self?.team === 3 ? "CT" : null, w = winnerTeam(r.winner);
    const won = w !== null && self ? w === self.team : null;
    if (won === true) us++; else if (won === false) them++;
    if (side && won !== null) sides[side][won ? "won" : "lost"]++;
    const tags = self ? [...new Set(roundCategories(replay, i, me, {}, findings).map(c => c.type))] : [];
    for (const t of tags) counts[t] = (counts[t] ?? 0) + 1;
    return {number: r.number, side, won, reason: r.reason, tags};
  });
  const pick = (o, keys) => Object.fromEntries(keys.filter(k => o && k in o).map(k => [k, o[k]]));
  const mine = review?.players?.find(p => p.id === me);
  const scoreboard = (review?.players ?? []).map(p => ({
    name: p.name, team: p.team, me: p.id === me, kills: p.stats.kills, deaths: p.stats.deaths, assists: p.stats.assists,
    adr: p.stats.adr, hs: p.stats.hs, kast: p.stats.kast, rating: p.ratings.hltv2
  })).sort((a, b) => (a.team ?? 0) - (b.team ?? 0) || b.rating - a.rating);
  const reviewList = result.picks.map(p => {
    const goto = Math.max(replay.rounds[p.round]?.live ?? 0, p.keyTick - REVIEW_LEAD_SECONDS * rate);
    return {
      round: p.roundNumber, side: p.side, won: p.won, kind: p.kind, category: p.category, title: p.title, confidence: p.confidence,
      why: p.why, lookAt: p.lookAt, keyTick: p.keyTick, keyClock: p.keyClock, roundClock: p.roundClock,
      gotoTick: Math.round(goto), command: `demo_gototick ${Math.round(goto)}`,
      also: p.categories.slice(1).map(c => c.type)
    };
  });
  return {
    format: "strat-scope-match-summary", version: MATCH_SUMMARY_VERSION, map: replay.map, tickRate: rate,
    rounds: replay.rounds.length, score: {us, them}, result: us > them ? "win" : us < them ? "loss" : "draw", sides,
    player: {name: playerName(replay, me), stats: mine?.stats ?? null, ratings: mine?.ratings ?? null,
             mechanics: pick(mine?.mechanics, MECH_KEYS), findings: mine?.findings ?? null},
    counts, roundList: rounds, scoreboard, review: reviewList
  };
}
