#!/usr/bin/env node
// Opponent roster check on real demos (no CS2, no UI).
// Usage: node scripts/opponent-roster.mjs <demo.dem|folder>... [--json <out.json>]
// Prints the detected target team, core/stand-in labels, demo membership and map grouping.
// Output contains player names and SteamIDs: keep it local (review-out/ is Git-ignored).
import fs from "node:fs";
import path from "node:path";
import {makeEntry} from "../web/session.mjs";
import {detectOpponent} from "../web/opponent.mjs";
import {parseDemFile} from "../recorder/record-clips.mjs";

const args = process.argv.slice(2), jsonAt = args.indexOf("--json"), out = jsonAt >= 0 ? args.splice(jsonAt, 2)[1] : null;
if (!args.length) { console.error("Pass one or more .dem files or folders."); process.exit(1); }
const files = args.flatMap(p => fs.statSync(p).isDirectory() ? fs.readdirSync(p).filter(f => /\.dem$/i.test(f)).sort().map(f => path.join(p, f)) : [p]);

// Keep only the frames roster detection needs, so several large demos fit in memory.
function slim(replay) {
  const rate = replay.tickRate || 64;
  const opening = r => { const near = r.frames.filter(f => f.tick >= r.live && f.tick - r.live <= rate).slice(0, 4); return near.length ? near : r.frames.slice(0, 1); };
  return {...replay, rounds: replay.rounds.map(r => ({...r, frames: opening(r), events: [], effects: [], grenades: []}))};
}

const entries = [];
for (const file of files) {
  const started = Date.now(), {replay} = await parseDemFile(file);
  entries.push(makeEntry(slim(replay), {id: path.basename(file)}));
  console.error(`parsed ${path.basename(file)}: ${replay.map}, ${replay.rounds.length} rounds, ${((Date.now() - started) / 1000).toFixed(1)} s`);
}
const d = detectOpponent(entries);
console.log(`Target team: ${d.core.length} core players; ${d.demos.length} of ${d.total} demos belong to the team${d.ambiguous ? " (ambiguous)" : ""}.`);
console.log(`Maps: ${d.maps.map(m => `${m.map} ${m.demos} demos / ${m.rounds} rounds`).join("; ")}`);
for (const p of d.players) console.log(`  ${p.name} [${p.id}]: ${p.description}, ${p.rounds} rounds, ${p.maps.join("/")}`);
for (const x of d.demos) console.log(`  demo ${x.source}: ${x.map}, ${x.teamKey} started ${x.startSide === 2 ? "T" : "CT"}, ${x.coreCount} core, sides ${x.sides.map(s => s === 2 ? "T" : s === 3 ? "C" : "?").join("")}`);
for (const x of d.unmatched) console.log(`  not matched ${x.source}: ${x.reason}`);
if (out) fs.writeFileSync(out, JSON.stringify(d, null, 1));
