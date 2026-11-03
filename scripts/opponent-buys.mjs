#!/usr/bin/env node
// Buy-type round library check on real demos (no CS2, no UI).
// Usage: node scripts/opponent-buys.mjs <demo.dem|folder>... [--json <out.json>]
// Prints counts per map, side and buy type (no player names or SteamIDs). The JSON holds demo file names
// and round facts: keep it local (review-out/ is Git-ignored).
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {makeEntry} from "../web/session.mjs";
import {detectOpponent, opponentRounds} from "../web/opponent.mjs";
import {buyLibrary} from "../web/opponent-buys.mjs";
import {parseDemFile} from "../recorder/record-clips.mjs";

const args = process.argv.slice(2), jsonAt = args.indexOf("--json"), out = jsonAt >= 0 ? args.splice(jsonAt, 2)[1] : null;
if (!args.length) { console.error("Pass one or more .dem files or folders."); process.exit(1); }
const files = args.flatMap(p => fs.statSync(p).isDirectory() ? fs.readdirSync(p).filter(f => /\.dem$/i.test(f)).sort().map(f => path.join(p, f)) : [p]);
const mapDefs = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "../web/maps/maps.json"), "utf8"));

// Keep only what the library needs (first 5 s, the last frame, kill/plant events, utility), so large demos fit.
const EVENTS = new Set(["player_hurt", "player_death", "bomb_planted"]);
function slim(replay) {
  const rate = replay.tickRate || 64;
  return {...replay, rounds: replay.rounds.map(r => {
    const early = r.frames.filter(f => f.tick >= r.live && f.tick - r.live <= rate * 5), last = r.frames.filter(f => f.tick <= r.end).at(-1);
    const frames = early.length ? early : r.frames.slice(0, 1);
    if (last && last !== frames.at(-1)) frames.push(last);
    return {...r, frames, events: r.events.filter(e => EVENTS.has(e.event_name)), postRoundEvents: [], grenades: []};
  })};
}

const entries = [];
for (const file of files) {
  const started = Date.now(), {replay} = await parseDemFile(file);
  entries.push(makeEntry(slim(replay), {id: path.basename(file)}));
  console.error(`parsed ${path.basename(file)}: ${replay.map}, ${replay.rounds.length} rounds, ${((Date.now() - started) / 1000).toFixed(1)} s`);
}
const d = detectOpponent(entries), lib = buyLibrary(entries, opponentRounds(entries, d), {mapDefs});
console.log(`Target team: ${d.core.length} core; ${d.demos.length} of ${d.total} demos matched; ${lib.rounds.length} target-team rounds.`);
const pct = v => v === null ? "-" : `${Math.round(v * 100)}%`;
for (const m of lib.maps) for (const s of m.sides) {
  console.log(`${m.map} ${s.side === 2 ? "T" : "CT"}: ${s.rounds} rounds${m.sites ? "" : " (no site anchors)"}`);
  for (const t of s.types) console.log(`  ${t.label}: ${t.sample}, win ${pct(t.winRate)} (${t.wins}/${t.decided}), route ${t.route ? `${t.route.name} ${t.route.sample}` : "-"}, contact ${t.contactSeconds === null ? "-" : `${t.contactSeconds.toFixed(1)} s`} (${t.contactSample}), utility S${t.utility.smoke.toFixed(1)} F${t.utility.flash.toFixed(1)} M${t.utility.fire.toFixed(1)} HE${t.utility.he.toFixed(1)}, representative R${t.representative?.number ?? "-"}`);
}
const types = {}; for (const r of lib.rounds) types[r.type] = (types[r.type] ?? 0) + 1;
console.log(`Totals: ${Object.entries(types).map(([k, n]) => `${k} ${n}`).join(", ")}; post-plant saves ${lib.rounds.filter(r => r.postPlantSave).length}; no contact ${lib.rounds.filter(r => r.contactSeconds === null).length}.`);
if (out) fs.writeFileSync(out, JSON.stringify({maps: lib.maps, rounds: lib.rounds}, null, 1));
