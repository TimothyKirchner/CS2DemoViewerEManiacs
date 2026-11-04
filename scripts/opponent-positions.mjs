#!/usr/bin/env node
// Positions and setups check on real demos (no CS2, no UI).
// Usage: node scripts/opponent-positions.mjs <demo.dem|folder>... [--json <out.json>]
// Prints counts per map and side (setups, spots, stand-in fills, AWP rounds, rotations, heatmap seconds per
// time window, callout coverage). No player names or SteamIDs; keep the JSON local (review-out/ is Git-ignored).
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {makeEntry} from "../web/session.mjs";
import {detectOpponent, opponentRounds} from "../web/opponent.mjs";
import {buyLibrary} from "../web/opponent-buys.mjs";
import {positionAnalysis, positionHeatmap, WINDOWS} from "../web/opponent-positions.mjs";
import {parseDemFile} from "../recorder/record-clips.mjs";

const args = process.argv.slice(2), jsonAt = args.indexOf("--json"), out = jsonAt >= 0 ? args.splice(jsonAt, 2)[1] : null;
if (!args.length) { console.error("Pass one or more .dem files or folders."); process.exit(1); }
const files = args.flatMap(p => fs.statSync(p).isDirectory() ? fs.readdirSync(p).filter(f => /\.dem$/i.test(f)).sort().map(f => path.join(p, f)) : [p]);
const mapDefs = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "../web/maps/maps.json"), "utf8"));

// Keep positions for the whole round, but inventories only in the first 21 s (buy value and setup AWP check).
const EVENTS = new Set(["player_hurt", "player_death", "bomb_planted"]);
function slim(replay) {
  const rate = replay.tickRate || 64;
  return {...replay, rounds: replay.rounds.map(r => ({...r, postRoundEvents: [], grenades: [], events: r.events.filter(e => EVENTS.has(e.event_name)),
    frames: r.frames.map(f => f.tick - r.live <= rate * 21 ? f : {tick: f.tick, players: f.players.map(({inventory, ...p}) => p)})}))};
}

const entries = [];
let samples = 0, placed = 0;
for (const file of files) {
  const started = Date.now(), {replay} = await parseDemFile(file);
  for (const r of replay.rounds) for (const f of r.frames) for (const p of f.players) { samples++; if (p.place) placed++; }
  entries.push(makeEntry(slim(replay), {id: path.basename(file)}));
  console.error(`parsed ${path.basename(file)}: ${replay.map}, ${replay.rounds.length} rounds, ${((Date.now() - started) / 1000).toFixed(1)} s`);
}
const d = detectOpponent(entries), refs = opponentRounds(entries, d), lib = buyLibrary(entries, refs, {mapDefs});
const a = positionAnalysis(entries, d, refs, {mapDefs, buyRounds: lib.rounds});
console.log(`Target team: ${d.core.length} core; ${d.demos.length} of ${d.total} demos matched; ${refs.length} target-team rounds. Callout on ${(placed / samples * 100).toFixed(2)}% of ${samples} player samples.`);
const fills = s => s.spots.reduce((n, x) => n + x.holders.filter(h => h.label.startsWith("filled by stand-in")).reduce((m, h) => m + h.count, 0), 0);
for (const m of a.maps) for (const [name, s, side] of [["CT", m.ct, 3], ["T", m.t, 2]]) {
  const heat = WINDOWS.map(w => { const h = positionHeatmap(entries, refs.filter(r => r.map === m.map && r.side === side), {window: w.id}); return `${w.label} ${h.playerSeconds.toFixed(0)} s / ${h.places.length} callouts`; });
  console.log(`${m.map} ${name}: ${s.rounds} rounds${m.sites ? "" : " (no site anchors)"}; ${s.setups.length} setups, top ${s.setups.slice(0, 3).map(g => `${g.label} ${g.sample}`).join("; ") || "-"}`);
  console.log(`  spots ${s.spots.length}, core players with a usual spot ${s.players.length}, filled by stand-in ${fills(s)}, AWP ${s.awp.sample} (${s.awp.spots.length} spots), rotations ${s.rotations.moves} in ${s.rotations.rounds} rounds`);
  console.log(`  heatmap: ${heat.join(", ")}`);
}
for (const [state, label] of [["leading", "leading"], ["tied", "tied"], ["trailing", "trailing"]]) console.log(`Score filter ${label}: ${positionAnalysis(entries, d, refs, {mapDefs, buyRounds: lib.rounds, filters: {score: state}}).rounds} rounds`);
if (out) fs.writeFileSync(out, JSON.stringify(a, (k, v) => v instanceof Set ? [...v] : v, 1));
