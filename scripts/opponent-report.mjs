#!/usr/bin/env node
// Tendencies check on real demos (no CS2, no UI).
// Usage: node scripts/opponent-tendencies.mjs <demo.dem|folder>... [--json <out.json>]
// Prints counts per map and side (openings, trades, stacks, retakes, utility clusters, clutches) plus economy
// and timeouts. No player names or SteamIDs; keep the JSON local (review-out/ is Git-ignored).
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {makeEntry} from "../web/session.mjs";
import {detectOpponent} from "../web/opponent.mjs";
import {antiStratReport, renderAntiStrat} from "../web/opponent-report.mjs";
import {parseDemFile} from "../recorder/record-clips.mjs";

const args = process.argv.slice(2), opt = k => { const i = args.indexOf(k); return i >= 0 ? args.splice(i, 2)[1] : null; }, out = opt("--md"), html = opt("--html");
if (!args.length) { console.error("Pass one or more .dem files or folders."); process.exit(1); }
const files = args.flatMap(p => fs.statSync(p).isDirectory() ? fs.readdirSync(p).filter(f => /\.dem$/i.test(f)).sort().map(f => path.join(p, f)) : [p]);
const mapDefs = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "../web/maps/maps.json"), "utf8"));

// Keep positions for the whole round, but inventories only in the first 21 s (buy value and setup samples).
const EVENTS = new Set(["player_hurt", "player_death", "player_blind", "bomb_planted"]);
function slim(replay) {
  const rate = replay.tickRate || 64;
  return {...replay, rounds: replay.rounds.map(r => ({...r, postRoundEvents: [], grenades: [], events: r.events.filter(e => EVENTS.has(e.event_name)),
    frames: r.frames.map(f => f.tick - r.live <= rate * 21 ? f : {tick: f.tick, players: f.players.map(({inventory, ...p}) => p)})}))};
}

const entries = [];
for (const file of files) {
  const started = Date.now(), {replay} = await parseDemFile(file);
  entries.push(makeEntry(slim(replay), {id: path.basename(file)}));
  console.error(`parsed ${path.basename(file)}: ${replay.map}, ${replay.rounds.length} rounds, ${((Date.now() - started) / 1000).toFixed(1)} s`);
}
const d = detectOpponent(entries);
const report = antiStratReport(entries, d, {mapDefs});
const n = report.maps.reduce((s, m) => s + m.sides.reduce((t, x) => t + x.habits.length, 0), 0);
console.log(`Target team: ${d.core.length} core; ${d.demos.length} of ${d.total} demos matched; ${report.rounds} rounds; ${report.maps.length} maps; ${n} habits; economy notes ${report.economy.length}.`);
for (const m of report.maps) console.log(`${m.map}: ${m.results.sample}; CT ${m.sides[0].habits.length} habits (${m.sides[0].habits.filter(h => h.small).length} small), T ${m.sides[1].habits.length} habits; stand-in notes ${m.standIns.length}`);
console.log(`Veto: ban ${report.veto.ban?.map ?? "-"}, pick ${report.veto.pick?.map ?? "-"}, unseen ${report.veto.unseen.length}`);
if (out) { fs.writeFileSync(out, renderAntiStrat(report, "markdown")); if (html) fs.writeFileSync(html, renderAntiStrat(report, "html")); }
