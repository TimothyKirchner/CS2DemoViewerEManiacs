#!/usr/bin/env node
// Tendencies check on real demos (no CS2, no UI).
// Usage: node scripts/opponent-tendencies.mjs <demo.dem|folder>... [--json <out.json>]
// Prints counts per map and side (openings, trades, stacks, retakes, utility clusters, clutches) plus economy
// and timeouts. No player names or SteamIDs; keep the JSON local (review-out/ is Git-ignored).
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {makeEntry} from "../web/session.mjs";
import {detectOpponent, opponentRounds} from "../web/opponent.mjs";
import {buyLibrary} from "../web/opponent-buys.mjs";
import {tendencyAnalysis} from "../web/opponent-tendencies.mjs";
import {parseDemFile} from "../recorder/record-clips.mjs";

const args = process.argv.slice(2), jsonAt = args.indexOf("--json"), out = jsonAt >= 0 ? args.splice(jsonAt, 2)[1] : null;
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
const d = detectOpponent(entries), refs = opponentRounds(entries, d), lib = buyLibrary(entries, refs, {mapDefs});
const a = tendencyAnalysis(entries, d, refs, {mapDefs, buyRounds: lib.rounds});
const pc = (n, of) => of ? `${n}/${of} (${Math.round(100 * n / of)}%)` : `${n}/0`;
console.log(`Target team: ${d.core.length} core; ${d.demos.length} of ${d.total} demos matched; ${refs.length} target-team rounds.`);
for (const m of a.maps) for (const [name, s] of [["T", m.t], ["CT", m.ct]]) {
  if (!s.rounds) continue;
  const o = s.duels.openings, tr = s.duels.trades, st = s.stacks, p = s.players;
  console.log(`${m.map} ${name}: ${s.rounds} rounds; openings won ${pc(o.wins, o.count)}, median ${o.medianSeconds?.toFixed(1)} s, ${s.duels.places.length} callouts, stand-in openings ${o.standIn}; round win after opening kill ${pc(o.afterWin.wins, o.afterWin.count)}, after death ${pc(o.afterLoss.wins, o.afterLoss.count)}`);
  console.log(`  trades: deaths traded ${pc(tr.traded, tr.deaths)}, opening deaths traded ${pc(tr.openingTraded, tr.openingDeaths)}, ${tr.pairs.length} trade pairs; core players with openings ${s.duels.players.length}`);
  console.log(`  stacks ${pc(st.stacks.count, st.sampled)} (A ${st.stacks.A}, B ${st.stacks.B}); plants ${st.plants.count}, won after plant ${pc(st.plants.wins, st.plants.decided)}${name === "CT" ? `, retakes ${st.plants.retakes} (won ${st.plants.retakeWins})` : ""}`);
  console.log(`  utility: ${Object.entries(s.utility.types).map(([t, u]) => `${t} ${u.thrown} thrown / ${u.clusters.length} clusters (top ${u.clusters[0]?.sample ?? "-"}, median ${u.clusters[0]?.medianSeconds?.toFixed(1) ?? "-"} s)`).join("; ")}`);
  console.log(`  clutches: team ${pc(p.team.wins, p.team.attempts)}, stand-in attempts ${p.team.standInAttempts ?? 0}; core player rows ${p.players.length}; eligible rounds ${p.coverage?.eligibleRounds}/${p.coverage?.selectedRounds}`);
}
const e = a.economy;
for (const r of e.rows) console.log(`Economy ${r.label}: ${r.sample}; force/half ${pc(r.force + r.half, r.count)}, eco ${r.eco}, full ${r.full}`);
console.log(`Buys (non-pistol ${e.buys.rounds}): eco ${e.buys.eco}, force ${e.buys.force}, half ${e.buys.half}, full ${e.buys.full}, anti-eco ${e.buys.antiEco}; saves ${pc(e.saves.saved, e.saves.lost)}, post-plant saves ${e.saves.postPlant}`);
const t = a.timeouts;
console.log(`Timeouts: ${t.count} in ${t.checked} checked rounds; likely target team ${t.likelyOwn}; timeout rounds won ${pc(t.wins, t.decided)}; freeze ${t.list.map(x => `${x.freezeSeconds.toFixed(0)}/${x.normalSeconds.toFixed(0)} s`).join(", ") || "-"}`);
if (out) fs.writeFileSync(out, JSON.stringify(a, null, 1));
