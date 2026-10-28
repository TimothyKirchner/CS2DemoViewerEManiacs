// Picks instructive moments and turns them into reviewable clips with critiques.
import {clock} from "./util.mjs";

export const TIPS = {
  "dry-opening": "Ask for a flash or entry smoke before taking first contact, or let a teammate entry and trade.",
  isolated: "Play within ~900 units of a teammate so a lost duel can be traded, or hold a passive angle when alone.",
  "no-trade": "When a teammate swings, pre-position to refrag the same angle instead of waiting for info.",
  "unused-utility": "Throw utility before committing to fights; grenades are lost on death.",
  "no-save": "At low round win chances keep the weapon for the next round unless the fight is free.",
  repeek: "After taking damage, reposition or wait for support instead of re-peeking the same player.",
  "multi-exposure": "Slice angles so only one enemy can see you at a time; use smokes to cut lines of sight.",
  "team-flash": "Call flashes and throw them so they pop behind teammates' line of sight.",
  crosshair: "Keep the crosshair at head height on the angle enemies will appear from while moving.",
  reaction: "Fewer unexpected angles means faster shots: clear one position at a time and pre-aim.",
  "moving-shots": "Counter-strafe (tap the opposite key) so you are below accurate speed when the first bullet leaves.",
  multikill: "Watch what made this work: positioning, timing and crosshair placement.",
  clutch: "Note the information use and timing that isolated each duel.",
  trade: "Good spacing: you were close enough to punish the kill.",
  "flash-assist": "Effective support utility: the enemy was blinded when the duel happened.",
  "clean-duel": "Prepared crosshair and a fast reaction won this duel."
};
const WEIGHT = {1: 1, 2: 2.5, 3: 4}, CLUSTER = 15, LEAD = 5, TAIL = 3;

export function buildClips(replay, findings, impact, {perPlayer = 4, overall = 12} = {}) {
  const rate = replay.tickRate, candidates = [];
  const byKey = new Map();
  for (const f of findings) { if (!f.player) continue; const k = f.player + "|" + f.round; byKey.set(k, [...(byKey.get(k) ?? []), f]); }
  for (const [k, list] of byKey) {
    const [player, roundIndex] = [k.split("|")[0], Number(k.split("|")[1])], round = replay.rounds[roundIndex];
    list.sort((a, b) => a.tick - b.tick);
    const clusters = [];
    for (const f of list) { const c = clusters.at(-1); if (c && f.tick - c.at(-1).tick <= CLUSTER * rate) c.push(f); else clusters.push([f]); }
    for (const c of clusters) {
      const wpa = impact.get(player)?.byRound?.[roundIndex] ?? 0;
      const score = c.reduce((s, f) => s + WEIGHT[f.severity] * (f.type === "clean-duel" ? 0.3 : f.kind === "highlight" ? 0.8 : 1), 0) + 6 * Math.abs(wpa) / clusters.length;
      const mistakes = c.filter(f => f.kind === "mistake"), highlights = c.filter(f => f.kind === "highlight");
      const lead = [...c].sort((a, b) => b.severity - a.severity || (a.kind === "mistake" ? -1 : 1))[0];
      const start = Math.max(round.start, c[0].tick - LEAD * rate), end = Math.min(round.end, Math.max(...c.map(f => f.endTick ?? f.tick)) + TAIL * rate);
      candidates.push({
        id: `r${round.number}-${player}-${c[0].tick}`, player, round: roundIndex, roundNumber: round.number, start, end, score: Math.round(score * 10) / 10,
        kind: mistakes.length && highlights.length ? "mixed" : mistakes.length ? "mistake" : "highlight",
        title: lead.title, clock: clock(round, c[0].tick, rate), wpa: Math.round(wpa * 1000) / 10,
        notes: c.map(f => ({tick: f.tick, clock: f.clock, kind: f.kind, type: f.type, severity: f.severity, title: f.title, detail: f.detail, tip: TIPS[f.type] ?? "", related: f.related ?? []}))
      });
    }
  }
  candidates.sort((a, b) => b.score - a.score || a.start - b.start);
  const chosen = new Set(), count = new Map();
  for (const c of candidates) { if ((count.get(c.player) ?? 0) >= perPlayer) continue; count.set(c.player, (count.get(c.player) ?? 0) + 1); chosen.add(c); }
  const top = new Set(candidates.slice(0, overall).map(c => c.id));
  return [...chosen].map(c => ({...c, featured: top.has(c.id)})).sort((a, b) => b.score - a.score);
}
