// One-match summary for a focus player: score, side split, the player's numbers, a scoreboard, how often each
// round situation happened, and the instructive rounds as manual-review notes (demo_gototick commands).
// Consumed by the agent hub's CS2 Coach "Matches" tab; plain JSON, no replay objects.
import {frameBefore, winnerTeam} from "./util.mjs";
import {roundCategories, playerName, teamBuy} from "./instructive.mjs";
import {BENCHMARKS} from "./mechanics.mjs";

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
    return {number: r.number, side, won, buy: self ? teamBuy(replay, i, self.team) : null, reason: r.reason, tags};
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
      why: p.why, lookAt: p.lookAt, buy: p.buy, winChance: p.winChance, keyTick: p.keyTick, keyClock: p.keyClock, roundClock: p.roundClock,
      gotoTick: Math.round(goto), command: `demo_gototick ${Math.round(goto)}`,
      also: p.categories.slice(1).map(c => c.type)
    };
  });
  return {
    format: "strat-scope-match-summary", version: MATCH_SUMMARY_VERSION, map: replay.map, tickRate: rate,
    rounds: replay.rounds.length, score: {us, them}, result: us > them ? "win" : us < them ? "loss" : "draw", sides,
    player: {name: playerName(replay, me), stats: mine?.stats ?? null, ratings: mine?.ratings ?? null,
             mechanics: pick(mine?.mechanics, MECH_KEYS), findings: mine?.findings ?? null},
    counts, roundList: rounds, scoreboard, review: reviewList,
    // What the numbers mean, so a heuristic never reads as exact.
    benchmarks: BENCHMARKS,
    definitions: {
      benchmarks: "Each pair is [good, poor]; mechanics sub-scores are 100 at the good value and 0 at the poor value. Crosshair in degrees, times in ms, strafe = share of shots at counter-strafed speed.",
      mechanics: "0-100 from the benchmark sub-scores (crosshair, reaction, time to damage, strafe, accuracy, headshot, duel wins). Heuristic.",
      decisions: "0-100: 100 * exp(-penalty / 12) + 4 * bonus, where penalty = mistake findings per round weighted 3/6/10 by severity (dry opening, isolated death, missed trade, re-peek, exposure, unused utility, no save, team flash) and bonus = highlight severity per round. Heuristic.",
      scope: "Composite of the HLTV 2.0 approximation, win-probability impact, mechanics and decisions. Heuristic, not a published rating.",
      winProbability: "Hand-set estimate from alive players, equipment, bomb and time; not fitted on match data.",
      flashAssists: "Game-credited flash assists only. Review notes also mark flashes that led to a teammate's kill without a game credit.",
      reaction: "From the game's spotted flag, which lags real visibility: values are optimistic; spotLagDuels counts duels where the lag mattered.",
      clocks: "keyClock = time since demo start; roundClock = round time left; in the why text, times after the plant are the bomb timer , marked (bomb)."
    }
  };
}
