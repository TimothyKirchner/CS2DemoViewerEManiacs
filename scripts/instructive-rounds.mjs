#!/usr/bin/env node
// Finds a player's most instructive rounds in CS2 demos and writes clip timestamps for the recorder.
// Usage: node scripts/instructive-rounds.mjs <demo.dem|demo.dem.zst|demo.dem.gz|folder>... [--player <steamid|name>]
//        [--out review-out] [--max 8] [--lead 6] [--tail 3] [--cache <dir>]
// Default player: "player" in recorder/recorder.json. Compressed demos are unpacked to a cache outside the repo.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import {execFileSync} from "node:child_process";
import {fileURLToPath, pathToFileURL} from "node:url";
import {reviewReplay} from "../web/review/engine/review.mjs";
import {instructiveRounds, instructivePlan, instructiveMarkdown, findPlayer} from "../web/review/engine/instructive.mjs";
import {matchSummary} from "../web/review/engine/match-summary.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEMO = /\.dem(\.zst|\.gz)?$/i;

export function parseArgs(argv) {
  const o = {inputs: [], out: path.join(REPO, "review-out"), cache: path.join(os.tmpdir(), "strat-scope-demos")};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], next = () => { const v = argv[++i]; if (v === undefined) throw new Error(`${a} needs a value`); return v; };
    if (a === "--player") o.player = next();
    else if (a === "--out") o.out = path.resolve(next());
    else if (a === "--cache") o.cache = path.resolve(next());
    else if (a === "--max") o.max = Number(next());
    else if (a === "--lead") o.leadSeconds = Number(next());
    else if (a === "--tail") o.tailSeconds = Number(next());
    else if (a === "-h" || a === "--help") o.help = true;
    else if (a.startsWith("--")) throw new Error(`Unknown option ${a}`);
    else o.inputs.push(a);
  }
  for (const k of ["max", "leadSeconds", "tailSeconds"]) if (k in o && !(o[k] >= 0)) throw new Error(`--${k.replace("Seconds", "")} must be a number >= 0`);
  if (!o.help && !o.inputs.length) throw new Error("Pass one or more demos (.dem, .dem.zst, .dem.gz) or folders");
  return o;
}

// Folders expand to the demos directly inside them.
export function listDemos(inputs) {
  return inputs.flatMap(p => fs.statSync(p).isDirectory() ? fs.readdirSync(p).filter(f => DEMO.test(f)).sort().map(f => path.join(p, f)) : [p]);
}
export const demoBase = file => path.basename(file).replace(DEMO, "");
const inside = (dir, parent) => { const r = path.relative(parent, dir); return !r.startsWith("..") && !path.isAbsolute(r); };

// Returns a playable .dem path; .zst/.gz are unpacked once into cacheDir (never inside the repository).
export function prepareDemo(file, cacheDir) {
  const kind = (path.basename(file).match(DEMO)?.[1] ?? "").toLowerCase();
  if (!DEMO.test(file)) throw new Error(`${file}: not a .dem, .dem.zst or .dem.gz file`);
  if (!kind) return path.resolve(file);
  if (inside(path.resolve(cacheDir), REPO)) throw new Error(`Cache folder ${cacheDir} is inside the repository; choose one outside it`);
  const target = path.join(cacheDir, `${demoBase(file)}-${fs.statSync(file).size.toString(36)}.dem`);
  if (fs.existsSync(target) && fs.statSync(target).size > 0) return target;
  fs.mkdirSync(cacheDir, {recursive: true});
  const part = target + ".part";
  if (kind === ".gz") fs.writeFileSync(part, zlib.gunzipSync(fs.readFileSync(file)));
  else if (typeof zlib.zstdDecompressSync === "function") fs.writeFileSync(part, zlib.zstdDecompressSync(fs.readFileSync(file)));
  else {
    try { execFileSync("zstd", ["-d", "-q", "-f", file, "-o", part], {stdio: "ignore"}); }
    catch { throw new Error(`${file}: this Node has no zstd support and no "zstd" command was found (use Node >= 22.15 or install zstd)`); }
  }
  fs.renameSync(part, target);
  return target;
}

export function defaultPlayer() {
  try { return JSON.parse(fs.readFileSync(path.join(REPO, "recorder", "recorder.json"), "utf8")).player || null; } catch { return null; }
}

export async function analyzeDemo(file, o) {
  const {parseDemFile} = await import("../recorder/record-clips.mjs");
  const dem = prepareDemo(file, o.cache), base = demoBase(file);
  const {replay, detail} = await parseDemFile(dem);
  const player = findPlayer(replay, o.player);
  if (!player) throw new Error(`player "${o.player}" not in this demo. Players: ${replay.players.map(p => p.name).join(", ")}`);
  const review = reviewReplay(replay, {detail});
  const opts = Object.fromEntries(["max", "leadSeconds", "tailSeconds"].filter(k => k in o).map(k => [k, o[k]]));
  const result = {...instructiveRounds(replay, review, {...opts, player: player.id}), source: path.resolve(file), demoFile: dem};
  const plan = instructivePlan(replay, result, {demoFile: dem});
  fs.mkdirSync(o.out, {recursive: true});
  const files = {json: path.join(o.out, `${base}.rounds.json`), plan: path.join(o.out, `${base}.plan.json`), md: path.join(o.out, `${base}.md`), match: path.join(o.out, `${base}.match.json`)};
  fs.writeFileSync(files.json, JSON.stringify({...result, plan}, null, 1));
  fs.writeFileSync(files.plan, JSON.stringify(plan, null, 1));
  fs.writeFileSync(files.md, instructiveMarkdown(result, {demo: dem, plan: files.plan}));
  fs.writeFileSync(files.match, JSON.stringify({...matchSummary(replay, review, result), source: path.resolve(file), demoFile: dem, analyzedAt: new Date().toISOString()}, null, 1));
  return {result, files};
}

export async function main(argv = process.argv.slice(2)) {
  const o = parseArgs(argv);
  if (o.help) { console.log(fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1, 5).map(l => l.replace(/^\/\/ ?/, "")).join("\n")); return; }
  o.player ??= defaultPlayer();
  if (!o.player) throw new Error('No player: pass --player or set "player" in recorder/recorder.json');
  let failed = 0;
  for (const file of listDemos(o.inputs)) {
    try {
      const {result, files} = await analyzeDemo(file, o);
      console.log(`${path.basename(file)}: ${result.picks.length} rounds for ${result.player.name} (${result.picks.map(p => `R${p.roundNumber} ${p.category}`).join(", ")})`);
      console.log(`  ${files.md}`);
    } catch (e) { failed++; console.error(`${path.basename(file)}: ${e.message}`); }
  }
  if (failed) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(e => { console.error(`instructive-rounds: ${e.message}`); process.exitCode = 1; });
}
