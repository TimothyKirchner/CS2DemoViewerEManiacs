import test from "node:test";
import assert from "node:assert/strict";
import {parseArgs, loadConfig, selectClips, clipCommands, ffmpegArgs, clipsIndex, fill} from "../recorder/record-clips.mjs";
import {buildRecordingPlan} from "../web/review/engine/clip-plan.mjs";

const replay = {source: "m.dem", map: "de_mirage", tickRate: 64, players: [{id: "76561198000000001", name: "Ann"}, {id: "76561198000000002", name: "Голова"}]};
const clip = (id, player, start, featured) => ({id, player, roundNumber: 3, start, end: start + 640, title: "Missed trade", clock: "1:10", kind: "mistake", featured,
  notes: [{tick: start + 200, kind: "mistake", severity: 2, title: "Missed trade", detail: "Teammate died 4 s away.", tip: "Stay within trade distance."}]});
const clips = [clip("a", "76561198000000001", 1000, true), clip("b", "76561198000000002", 5000, true), clip("c", "76561198000000001", 9000, false)];
const plan = buildRecordingPlan(replay, {}, clips);
const featured = new Set(["a", "b"]);

test("recorder options require an input and parse selections", () => {
  assert.throws(() => parseArgs([]), /--review/);
  const o = parseArgs(["--review", "x.scopereview", "--top", "2", "--only", "1,c", "--dry-run", "--mode", "obs"]);
  assert.deepEqual([o.review, o.top, o.only, o.dryRun, o.mode], ["x.scopereview", 2, ["1", "c"], true, "obs"]);
});

test("clip selection defaults to featured, then honours player, only and top", () => {
  assert.deepEqual(selectClips(plan, {}, featured).map(c => c.id), ["a", "b"]);
  assert.deepEqual(selectClips(plan, {all: true}, featured).map(c => c.id), ["a", "b", "c"]);
  assert.deepEqual(selectClips(plan, {player: "ann"}, featured).map(c => c.id), ["a", "c"]);
  assert.deepEqual(selectClips(plan, {only: ["3"]}, featured).map(c => c.id), ["c"]);
  assert.deepEqual(selectClips(plan, {top: 1}, featured).map(c => c.id), ["a"]);
  assert.deepEqual(selectClips(plan, {player: "76561198000000002"}, featured).map(c => c.id), ["b"]);
});

test("non-Latin names get an account-id file tag", () => {
  assert.match(plan.clips[0].file, /^01_R3_Ann_Missed_trade$/);
  assert.match(plan.clips[1].file, /^02_R3_id39734274_Missed_trade$/);
});

test("console script seeks paused, spectates by account and wraps HLAE recording", () => {
  const cfg = loadConfig(null); cfg.hlae.outputDir = "C:\\out dir";
  const c = clipCommands(plan.clips[0], cfg);
  assert.deepEqual(c.seek, ["demo_pause", "demo_gototick 1000", "demo_pause", "spec_player_by_accountid 39734273", "spec_mode 1"]);
  assert.ok(c.start.includes('mirv_streams record name "C:\\out dir"') && c.start.at(-1) === "mirv_streams record start");
  assert.deepEqual(c.stop, ["demo_pause", "mirv_streams record end"]);
  assert.deepEqual(clipCommands(plan.clips[0], cfg, "obs").start, []);
  assert.equal(fill("{a}-{missing}", {a: 1}), "1-{missing}");
});

test("ffmpeg trims to the clip and burns relative subtitles", () => {
  const args = ffmpegArgs(plan.clips[0], "raw.mp4", loadConfig(null), {lead: 0.5});
  assert.deepEqual(args.slice(args.indexOf("-ss"), args.indexOf("-ss") + 6), ["-ss", "0.5", "-i", "raw.mp4", "-t", "10"]);
  assert.match(args[args.indexOf("-vf") + 1], /^subtitles=01_R3_Ann_Missed_trade\.srt:force_style=/);
  assert.ok(!ffmpegArgs(plan.clips[0], "raw.mp4", loadConfig(null), {burn: false}).includes("-vf"));
  const muxed = ffmpegArgs(plan.clips[0], "raw.mp4", loadConfig(null), {lead: 0.5, audioName: "raw.wav"}).join(" ");
  assert.match(muxed, /-ss 0\.5 -i raw\.mp4 -ss 0\.5 -i raw\.wav -map 0:v:0 -map 1:a:0 -t 10/);
  assert.match(clipsIndex(plan, plan.clips, new Map([["b", {error: "no video"}]])), /not recorded \(no video\)[\s\S]*Stay within trade distance/);
});
