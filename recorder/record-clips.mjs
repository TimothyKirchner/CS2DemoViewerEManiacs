#!/usr/bin/env node
// Records review clips from CS2 demo playback (HLAE or OBS) and burns the critiques in with ffmpeg.
// Usage: node recorder/record-clips.mjs --review x.scopereview [--top 2] [--dry-run]
//        node recorder/record-clips.mjs --plan plan.json [--config recorder/recorder.json]
// See recorder/README.md for setup, options and the verified command sequence.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import {spawn, execFileSync} from "node:child_process";
import {fileURLToPath, pathToFileURL} from "node:url";
import {reviewReplay} from "../web/review/engine/review.mjs";
import {buildRecordingPlan, spectateCommands} from "../web/review/engine/clip-plan.mjs";
import {Netcon, sleep} from "./netcon.mjs";
import {VConsole} from "./vconsole.mjs";
import {RECORDING_LAUNCH_ARGS, steamRoot, backupSettings, restoreSettings, cs2Running, waitForCs2Exit} from "./cs2-settings.mjs";
import {Obs} from "./obs.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DEMO_NAME = "stratscope_review";
const VIDEO_EXT = /\.(mp4|mkv|mov|avi|flv|webm)$/i;

export const DEFAULTS = {
  mode: "hlae",
  player: "",
  // Clips kept per player by the review; raised when the run focuses on one player.
  playerClips: 10,
  cs2: "",
  hlae: {
    exe: "",
    hookDll: "",
    outputDir: "",
    fps: 60,
    recordStart: [
      "mirv_streams record name \"{outputDir}\"",
      "mirv_streams record fps {fps}",
      "mirv_streams record screen enabled 1",
      "mirv_streams settings edit afxDefault settings afxFfmpegYuv420p",
      "mirv_streams record startMovieWav 1",
      "mirv_streams record start"
    ],
    recordEnd: ["mirv_streams record end"],
    // HLAE renders at a fixed frame rate, so playback is slower than realtime; wait seconds * slowFactor.
    slowFactor: 2.5
  },
  obs: {exe: "", url: "ws://127.0.0.1:4455", password: "", slowFactor: 1, scene: "Strat Scope CS2", source: "CS2 window", window: "Counter-Strike 2:SDL_app:cs2.exe"},
  ffmpeg: "ffmpeg",
  // "vconsole" (CS2's VConsole2 port, default) or "netcon" (-netconport; current CS2 builds ignore it).
  console: "vconsole",
  vconsolePort: 29000,
  netconPort: 2121,
  width: 1920,
  height: 1080,
  launchArgs: RECORDING_LAUNCH_ARGS,
  startupSeconds: 20,
  demoLoadSeconds: 25,
  settleSeconds: 2,
  leadSeconds: 0,
  // Only non-archived commands belong here: archived convars (volume, spec_show_xray, ...) end up in the
  // player's own config. Settings are also backed up and restored around every launch (cs2-settings.mjs).
  setupCommands: [],
  burnStyle: "FontName=Arial,FontSize=13,PrimaryColour=&H00FFFFFF,OutlineColour=&H80000000,BorderStyle=3,Outline=2,Shadow=0,MarginV=40",
  crf: 20
};

export function parseArgs(argv) {
  const o = {only: [], dryRun: false, noLaunch: false, keepOpen: false, all: false, burn: true};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], next = () => argv[++i];
    if (a === "--review") o.review = next();
    else if (a === "--plan") o.plan = next();
    else if (a === "--demo") o.demo = next();
    else if (a === "--config") o.config = next();
    else if (a === "--out") o.out = next();
    else if (a === "--mode") o.mode = next();
    else if (a === "--player") o.player = next();
    else if (a === "--top") o.top = Number(next());
    else if (a === "--only") o.only.push(...next().split(","));
    else if (a === "--all") o.all = true;
    else if (a === "--dry-run") o.dryRun = true;
    else if (a === "--no-launch") o.noLaunch = true;
    else if (a === "--keep-open") o.keepOpen = true;
    else if (a === "--no-burn") o.burn = false;
    else if (a === "--restore-settings") o.restoreSettings = next();
    else if (a === "-h" || a === "--help") o.help = true;
    else throw new Error(`Unknown option ${a}`);
  }
  if (!o.help && !o.review && !o.plan && !o.restoreSettings) throw new Error("Pass --review <file.scopereview> or --plan <plan.json>");
  return o;
}

export function loadConfig(file) {
  const user = file && fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
  return {...DEFAULTS, ...user, hlae: {...DEFAULTS.hlae, ...user.hlae}, obs: {...DEFAULTS.obs, ...user.obs}};
}

export function readReviewFile(file) {
  const raw = fs.readFileSync(file);
  const data = JSON.parse((raw[0] === 0x1f && raw[1] === 0x8b ? zlib.gunzipSync(raw) : raw).toString("utf8"));
  if (data.format !== "strat-scope-review" || !data.replay) throw new Error(`${file} is not a .scopereview file`);
  return data;
}

// Parses a .dem with the bundled WASM parser (same passes as the review UI).
export async function parseDemFile(file) {
  const vm = await import("node:vm");
  const vendor = path.join(HERE, "..", "web", "vendor");
  const {parseDemo} = await import("../web/parse-demo.mjs"), {createReport} = await import("../web/diagnostics.mjs");
  const {parseReviewDetail} = await import("../web/review/parse-review.mjs");
  if (!globalThis.dp) {
    vm.runInThisContext(fs.readFileSync(path.join(vendor, "demoparser2.js"), "utf8") + ";globalThis.dp=wasm_bindgen;");
    await globalThis.dp({module_or_path: fs.readFileSync(path.join(vendor, "demoparser2_bg.wasm"))});
  }
  const bytes = new Uint8Array(fs.readFileSync(file)), name = path.basename(file);
  const replay = await parseDemo(bytes, name, globalThis.dp, createReport({name, size: bytes.length}));
  return {replay, detail: parseReviewDetail(bytes, globalThis.dp, replay)};
}

// Default: featured clips in score order. --player narrows by name/SteamID, --only by clip id or plan index.
export function selectClips(plan, {all = false, player, only = [], top} = {}, featured = null) {
  let clips = plan.clips;
  if (only.length) clips = clips.filter(c => only.includes(c.id) || only.includes(String(c.index)));
  else {
    if (player) { const q = player.toLowerCase(); clips = clips.filter(c => c.player.toLowerCase().includes(q) || c.steamId === player); }
    if (!all && !player && featured) clips = clips.filter(c => featured.has(c.id));
  }
  return Number.isFinite(top) && top > 0 ? clips.slice(0, top) : clips;
}

export function fill(template, vars) { return template.replace(/\{(\w+)\}/g, (m, k) => k in vars ? String(vars[k]) : m); }

// Console script for one clip, split into the phases record-clips waits between.
export function clipCommands(clip, cfg, mode = cfg.mode) {
  const vars = {outputDir: cfg.hlae.outputDir, fps: cfg.hlae.fps, name: clip.file};
  return {
    seek: ["demo_pause", `demo_gototick ${clip.startTick}`, "demo_pause", ...spectateCommands(clip)],
    start: mode === "hlae" ? cfg.hlae.recordStart.map(c => fill(c, vars)) : [],
    resume: ["demo_resume"],
    stop: ["demo_pause", ...(mode === "hlae" ? cfg.hlae.recordEnd.map(c => fill(c, vars)) : [])]
  };
}

// HLAE writes game audio as a separate .wav next to the video; pass it as audioName to mux it back in.
export function ffmpegArgs(clip, rawName, cfg, {burn = true, lead = cfg.leadSeconds, audioName = null} = {}) {
  const args = ["-y", "-hide_banner", "-loglevel", "error"], seek = lead > 0 ? ["-ss", String(lead)] : [];
  args.push(...seek, "-i", rawName);
  if (audioName) args.push(...seek, "-i", audioName, "-map", "0:v:0", "-map", "1:a:0");
  args.push("-t", String(clip.seconds));
  if (burn) args.push("-vf", `subtitles=${clip.file}.srt:force_style='${cfg.burnStyle}'`);
  args.push("-c:v", "libx264", "-preset", "veryfast", "-crf", String(cfg.crf), "-pix_fmt", "yuv420p", "-c:a", "aac", "-movflags", "+faststart", `${clip.file}.mp4`);
  return args;
}

export function clipsIndex(plan, clips, results = new Map()) {
  const lines = [`# Strat Scope review clips`, "", `Demo: ${plan.demoFile} · Map: ${plan.map} · ${clips.length} clip(s)`, ""];
  for (const c of clips) {
    const r = results.get(c.id);
    lines.push(`## ${c.index}. ${c.title}`, "", `- File: ${r?.video ? `\`${path.basename(r.video)}\`` : r?.error ? `not recorded (${r.error})` : `\`${c.file}.mp4\``}`,
      `- Player: ${c.player} · Round ${c.roundNumber} · ${c.seconds}s · ticks ${c.startTick}-${c.endTick} · ${c.kind}`, "");
    for (const n of c.notes) lines.push(`- **${n.seconds}s ${n.title}**: ${n.detail}${n.tip ? ` _Tip: ${n.tip}_` : ""}`);
    lines.push("");
  }
  return lines.join("\n");
}

// Steam library lookup for cs2.exe (registry SteamPath plus libraryfolders.vdf).
export function findCs2() {
  const libs = new Set();
  try {
    const out = execFileSync("reg", ["query", "HKCU\\Software\\Valve\\Steam", "/v", "SteamPath"], {encoding: "utf8"});
    const steam = out.match(/SteamPath\s+REG_SZ\s+(.+)/)?.[1]?.trim();
    if (steam) {
      libs.add(path.normalize(steam));
      const vdf = path.join(steam, "steamapps", "libraryfolders.vdf");
      if (fs.existsSync(vdf)) for (const m of fs.readFileSync(vdf, "utf8").matchAll(/"path"\s+"([^"]+)"/g)) libs.add(path.normalize(m[1].replace(/\\\\/g, "\\")));
    }
  } catch {}
  for (const lib of libs) {
    const exe = path.join(lib, "steamapps", "common", "Counter-Strike Global Offensive", "game", "bin", "win64", "cs2.exe");
    if (fs.existsSync(exe)) return exe;
  }
  return "";
}
export function findSteam() {
  try {
    const out = execFileSync("reg", ["query", "HKCU\\Software\\Valve\\Steam", "/v", "SteamExe"], {encoding: "utf8"});
    const exe = out.match(/SteamExe\s+REG_SZ\s+(.+)/)?.[1]?.trim();
    return exe && fs.existsSync(exe) ? path.normalize(exe) : "";
  } catch { return ""; }
}
export const csgoDir =cs2Exe => path.resolve(path.dirname(cs2Exe), "..", "..", "csgo");

function newestFile(dir, since, pattern) {
  let best = null;
  const walk = d => { for (const e of fs.readdirSync(d, {withFileTypes: true})) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (pattern.test(e.name)) { const t = fs.statSync(p).mtimeMs; if (t >= since && (!best || t > best.t)) best = {p, t}; }
  } };
  if (fs.existsSync(dir)) walk(dir);
  return best?.p ?? null;
}

function run(cmd, args, cwd) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, {cwd, stdio: ["ignore", "ignore", "pipe"]}); let err = "";
    p.stderr.on("data", d => err += d);
    p.on("error", reject);
    p.on("close", code => code === 0 ? resolve() : reject(new Error(`${path.basename(cmd)} exited ${code}: ${err.trim().split(/\r?\n/).at(-1) ?? ""}`)));
  });
}

// Creates (once) a scene with a Game Capture of the CS2 window and makes it the program scene.
// Uses Window Capture with Windows Graphics Capture (method 2): Game Capture's hook stayed black on CS2 here.
// Only this source is enabled in the scene, scaled to the canvas.
export async function ensureObsScene(obs, {scene, source, window}) {
  const {scenes} = await obs.request("GetSceneList");
  if (!scenes.some(s => s.sceneName === scene)) await obs.request("CreateScene", {sceneName: scene});
  // priority 2 = match by executable, so the source never falls back to another window (it once bound to Steam).
  const inputSettings = {window, priority: 2, method: 2, cursor: false, capture_audio: true, client_area: true};
  const {inputs} = await obs.request("GetInputList");
  if (!inputs.some(i => i.inputName === source)) await obs.request("CreateInput", {sceneName: scene, inputName: source, inputKind: "window_capture", inputSettings});
  // Re-applied every run so the source rebinds to the CS2 window that exists now.
  else await obs.request("SetInputSettings", {inputName: source, inputSettings, overlay: true});
  let {sceneItems} = await obs.request("GetSceneItemList", {sceneName: scene});
  if (!sceneItems.some(i => i.sourceName === source)) {
    await obs.request("CreateSceneItem", {sceneName: scene, sourceName: source});
    ({sceneItems} = await obs.request("GetSceneItemList", {sceneName: scene}));
  }
  const {baseWidth, baseHeight} = await obs.request("GetVideoSettings");
  for (const it of sceneItems) {
    await obs.request("SetSceneItemEnabled", {sceneName: scene, sceneItemId: it.sceneItemId, sceneItemEnabled: it.sourceName === source});
    if (it.sourceName === source) await obs.request("SetSceneItemTransform", {sceneName: scene, sceneItemId: it.sceneItemId,
      sceneItemTransform: {positionX: 0, positionY: 0, boundsType: "OBS_BOUNDS_SCALE_INNER", boundsWidth: baseWidth, boundsHeight: baseHeight}});
  }
  await obs.request("SetCurrentProgramScene", {sceneName: scene});
}

// Restores the CS2 window and brings it to the front; minimized or covered windows record black.
export function focusCs2() {
  if (process.platform !== "win32") return;
  const ps = `$p=Get-Process cs2 -ErrorAction SilentlyContinue|?{$_.MainWindowHandle -ne 0}|select -First 1;if($p){Add-Type -Name W -Namespace U -MemberDefinition '[DllImport("user32.dll")]public static extern bool ShowWindow(System.IntPtr h,int c);[DllImport("user32.dll")]public static extern bool SetForegroundWindow(System.IntPtr h);';[U.W]::ShowWindow($p.MainWindowHandle,9)|Out-Null;[U.W]::SetForegroundWindow($p.MainWindowHandle)|Out-Null}`;
  try { execFileSync("powershell.exe", ["-NoProfile", "-Command", ps], {stdio: "ignore", timeout: 15000}); } catch {}
}

function launchCommand(cfg) {
  // No -w/-h/-windowed: CS2 writes those into the player's cs2_video.txt.
  const game = [...cfg.launchArgs, ...(cfg.console === "netcon" ? ["-netconport", String(cfg.netconPort)] : [])];
  // Anti-cheat drivers (FACEIT, Vanguard) can deny starting cs2.exe from another process, so go through Steam.
  if (cfg.mode !== "hlae") return cfg.steam ? {cmd: cfg.steam, args: ["-applaunch", "730", ...game]} : {cmd: cfg.cs2, args: game};
  game.unshift("-steam");
  const hook = cfg.hlae.hookDll || path.join(path.dirname(cfg.hlae.exe), "x64", "AfxHookSource2.dll");
  return {cmd: cfg.hlae.exe, args: ["-customLoader", "-noGui", "-autoStart", "-hookDllPath", hook, "-programPath", cfg.cs2, "-cmdLine", game.join(" ")]};
}

const say = (...a) => console.log(...a);

async function sendAll(con, cmds, dry) {
  for (const c of cmds) { if (dry) say(`    > ${c}`); else { con.send(c); await sleep(150); } }
}

export async function main(argv = process.argv.slice(2)) {
  const o = parseArgs(argv);
  if (o.help) { say(fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1, 5).map(l => l.replace(/^\/\/ ?/, "")).join("\n")); return; }
  if (o.restoreSettings) {
    if (!await waitForCs2Exit(10000)) throw new Error("Close CS2 first; it rewrites its settings when it exits");
    say(`Restored ${restoreSettings(o.restoreSettings)} CS2 settings files from ${o.restoreSettings}`); return;
  }
  const cfg = loadConfig(o.config ?? path.join(HERE, "recorder.json"));
  if (o.mode) cfg.mode = o.mode;
  // recorder.json "player" focuses every run on one player (name or SteamID64) unless --all or --only is given.
  if (!o.all && !o.only.length) o.player ??= cfg.player || undefined;
  if (!["hlae", "obs"].includes(cfg.mode)) throw new Error(`mode must be "hlae" or "obs"`);
  cfg.cs2 ||= findCs2();
  if (cfg.steam === undefined) cfg.steam = findSteam();

  let plan, featured = null, demo = o.demo, baseFile = o.review ?? o.plan;
  if (o.review) {
    const data = /\.dem$/i.test(o.review) ? await parseDemFile(o.review) : readReviewFile(o.review);
    const review = reviewReplay(data.replay, {detail: data.detail, perPlayer: o.player ? cfg.playerClips : 4});
    if (/\.dem$/i.test(o.review)) demo ||= path.resolve(o.review);
    featured = new Set(review.clips.filter(c => c.featured).map(c => c.id));
    plan = buildRecordingPlan(data.replay, review, review.clips);
  } else plan = JSON.parse(fs.readFileSync(o.plan, "utf8"));
  if (plan.format !== "strat-scope-recording-plan") throw new Error("Not a Strat Scope recording plan");
  demo ||= path.resolve(path.dirname(baseFile), path.basename(plan.demoFile ?? ""));
  const clips = selectClips(plan, o, featured);
  if (o.player && !clips.length) throw new Error(`No clips for player "${o.player}". Players in this demo: ${[...new Set(plan.clips.map(c => c.player))].join(", ")}`);
  if (!clips.length) throw new Error("No clips selected (try --all or --player)");
  const out = path.resolve(o.out ?? baseFile.replace(/\.(scopereview|json|dem)$/i, "") + "-clips");
  cfg.hlae.outputDir ||= path.join(out, "hlae-raw");

  say(`Strat Scope recorder · ${cfg.mode.toUpperCase()}${o.dryRun ? " · dry run" : ""}`);
  say(`  demo:   ${demo}${fs.existsSync(demo) ? "" : "  (MISSING)"}`);
  say(`  cs2:    ${cfg.cs2 || "(not found: set \"cs2\" in recorder.json)"}`);
  if (cfg.mode === "hlae") say(`  hlae:   ${cfg.hlae.exe || "(not set: set hlae.exe in recorder.json)"}`);
  say(`  out:    ${out}`);
  say(`  clips:  ${clips.length} of ${plan.clips.length}`);

  fs.mkdirSync(out, {recursive: true});
  for (const c of clips) fs.writeFileSync(path.join(out, `${c.file}.srt`), c.subtitles, "utf8");
  fs.writeFileSync(path.join(out, "plan.json"), JSON.stringify({...plan, clips}, null, 1));

  const problems = [];
  if (!fs.existsSync(demo)) problems.push(`demo not found: ${demo}`);
  if (!o.noLaunch && !fs.existsSync(cfg.cs2)) problems.push("cs2.exe not found");
  if (!o.noLaunch && cfg.mode === "hlae" && !fs.existsSync(cfg.hlae.exe)) problems.push("HLAE.exe not found");
  const launch = launchCommand(cfg);
  if (o.dryRun) {
    if (!o.noLaunch) say(`\nLaunch: "${launch.cmd}" ${launch.args.map(a => /\s/.test(a) ? `"${a}"` : a).join(" ")}`);
    say(`Console (${cfg.console} 127.0.0.1:${cfg.console === "netcon" ? cfg.netconPort : cfg.vconsolePort}):`);
    await sendAll(null, [...cfg.setupCommands, `playdemo ${DEMO_NAME}`], true);
  }

  const results = new Map(), slow = cfg.mode === "hlae" ? cfg.hlae.slowFactor : cfg.obs.slowFactor;
  let con = null, obs = null, child = null, backup = null;
  try {
    if (!o.dryRun) {
      if (problems.length) throw new Error(problems.join("; "));
      if (cfg.mode === "obs") { obs = new Obs(); await obs.connect(cfg.obs.url, cfg.obs.password); await ensureObsScene(obs, cfg.obs); }
      const dest = path.join(csgoDir(cfg.cs2), `${DEMO_NAME}.dem`);
      fs.copyFileSync(demo, dest); say(`Copied demo to ${dest}`);
      if (!o.noLaunch) {
        if (cs2Running()) throw new Error("CS2 is already running; close it first (or pass --no-launch) so its settings can be backed up");
        backup = backupSettings(steamRoot(cfg.cs2)); say(`Backed up CS2 settings to ${backup}`);
      }
      if (!o.noLaunch) { child = spawn(launch.cmd, launch.args, {detached: true, stdio: "ignore"}); child.unref(); say("Launched CS2, waiting for console..."); }
      con = cfg.console === "netcon" ? await new Netcon().connect(cfg.netconPort) : await new VConsole().connect(cfg.vconsolePort);
      if (!o.noLaunch) await sleep(cfg.startupSeconds * 1000);
      const failed = con.waitFor(/Error processing network message|Discarding pending request 'Playing Demo|Failed to open demo/i, cfg.demoLoadSeconds * 1000);
      await sendAll(con, [...cfg.setupCommands, `playdemo ${DEMO_NAME}`]);
      const why = await failed;
      if (why) throw new Error(`CS2 cannot play this demo ("${why.trim()}"); it was probably recorded by an older game build`);
    }
    for (const c of clips) {
      const cmd = clipCommands(c, cfg);
      say(`\n[${c.index}] ${c.file} · ${c.seconds}s · ticks ${c.startTick}-${c.endTick}`);
      if (o.dryRun) {
        await sendAll(null, cmd.seek, true); say(`    (settle ${cfg.settleSeconds}s)`);
        await sendAll(null, cmd.start, true); if (cfg.mode === "obs") say("    obs StartRecord");
        await sendAll(null, cmd.resume, true); say(`    (wait ${Math.round(c.seconds * slow * 10) / 10}s)`);
        await sendAll(null, cmd.stop, true); if (cfg.mode === "obs") say("    obs StopRecord");
        say(`    ffmpeg ${ffmpegArgs(c, "<raw video>", cfg, {burn: o.burn}).join(" ")}`);
        continue;
      }
      try {
        await sendAll(con, cmd.seek); if (obs) focusCs2(); await sleep(cfg.settleSeconds * 1000);
        // Log the tick CS2 reports after the seek so plan ticks can be checked against demo ticks.
        const at = con.log.length; con.send("demo_info"); await sleep(600);
        const info = con.log.slice(at).filter(l => /tick/i.test(l)).join(" | ");
        if (info) say(`    demo_info: ${info.slice(0, 200)}`);
        const since = Date.now() - 1000;
        await sendAll(con, cmd.start); if (obs) await obs.request("StartRecord");
        // OBS records in realtime, so the paused frames before demo_resume are trimmed off.
        const lead = cfg.leadSeconds + (obs ? (Date.now() - since - 1000) / 1000 : 0);
        await sendAll(con, cmd.resume); await sleep(c.seconds * slow * 1000 + 500);
        await sendAll(con, cmd.stop);
        let rawSrc = obs ? (await obs.request("StopRecord")).outputPath : null;
        await sleep(3000);
        rawSrc ??= newestFile(cfg.hlae.outputDir, since, VIDEO_EXT);
        if (!rawSrc) throw new Error(`no video found in ${cfg.mode === "hlae" ? cfg.hlae.outputDir : "OBS output"}`);
        const rawName = `${c.file}.raw${path.extname(rawSrc)}`;
        fs.copyFileSync(rawSrc, path.join(out, rawName));
        const wav = obs ? null : newestFile(cfg.hlae.outputDir, since, /\.wav$/i), audioName = wav ? `${c.file}.raw.wav` : null;
        if (wav) fs.copyFileSync(wav, path.join(out, audioName));
        say(`    raw: ${rawSrc}${wav ? ` + ${path.basename(wav)}` : ""} (lead ${lead.toFixed(2)}s)`);
        await run(cfg.ffmpeg, ffmpegArgs(c, rawName, cfg, {burn: o.burn, audioName, lead}), out);
        results.set(c.id, {video: path.join(out, `${c.file}.mp4`)}); say(`    ok -> ${c.file}.mp4`);
      } catch (e) { results.set(c.id, {error: e.message}); say(`    FAILED: ${e.message} (subtitles kept as ${c.file}.srt)`); }
    }
  } finally {
    if (con && !o.keepOpen && !o.noLaunch) { try { con.send("quit"); } catch {} }
    con?.close(); obs?.close();
    if (backup && !o.keepOpen) {
      if (await waitForCs2Exit()) say(`Restored ${restoreSettings(backup)} CS2 settings files from ${backup}`);
      else say(`CS2 is still running; restore your settings after closing it: node recorder/record-clips.mjs --restore-settings "${backup}"`);
    } else if (backup) say(`CS2 left open. After closing it run: node recorder/record-clips.mjs --restore-settings "${backup}"`);
  }
  fs.writeFileSync(path.join(out, "clips.md"), clipsIndex(plan, clips, results));
  say(`\nWrote ${path.join(out, "clips.md")}`);
  if (o.dryRun && problems.length) say(`Not ready for a real run: ${problems.join("; ")}`);
  return {out, clips, results, problems};
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(e => { console.error(`record-clips: ${e.message}`); process.exitCode = 1; });
}
