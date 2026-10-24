import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {createReport, beginStep, finishReport, failReport, errorDetails} from "../web/diagnostics.mjs";
import {parseDemo} from "../web/parse-demo.mjs";

const bytes = new TextEncoder().encode("PBDEMS2\0private demo contents");
const file = {name: "C:\\Users\\Private\\match.dem", size: bytes.length, lastModified: 0};
const events = [{event_name: "round_freeze_end", tick: 64, total_rounds_played: 0}, {event_name: "round_end", tick: 640, winner: 2}];
const rows = [{tick: 64, steamid: "1", name: "Private Player", X: 0, Y: 0, team_num: 2, health: 100}];
function parser() {
  return {
    parseHeader: () => ({map_name: "de_mirage", network_protocol: 123, server_name: "Private Server", client_name: "Private Client"}),
    parseEvents: () => events, parseTicks: () => rows, parseGrenades: () => []
  };
}

for (const operation of ["parseHeader", "parseEvents", "parseTicks"]) {
  test(`WASM string failure in ${operation} identifies the correct stage and retains the original message`, async () => {
    const report = createReport(file);
    const dp = parser(); dp[operation] = () => {throw "Entity not found";};
    const progress = [];
    try {
      await parseDemo(bytes, file.name, dp, report, message => progress.push(structuredClone(message)));
      assert.fail("Expected parser failure");
    } catch (error) { failReport(report, error); }
    assert.equal(report.status, "failed");
    assert.equal(report.operation, operation);
    assert.equal(report.error.message, "Entity not found");
    assert.equal(report.error.stack, null);
    assert.equal(report.steps.at(-1).status, "failed");
    assert.equal(progress.at(-1).report.operation, operation);
    assert.ok(report.steps.slice(0, -1).every(s => s.status === "completed"));
    assert.doesNotThrow(() => JSON.stringify(report));
  });
}

test("native error stacks, causes and circular causes are serializable", () => {
  const cause = new Error("Original cause");
  cause.cause = cause;
  const error = new TypeError("Invalid packet", {cause});
  error.code = "BAD_PACKET";
  const details = errorDetails(error);
  assert.match(details.stack, /TypeError: Invalid packet/);
  assert.equal(details.code, "BAD_PACKET");
  assert.equal(details.cause.message, "Original cause");
  assert.equal(details.cause.cause.name, "CircularCause");
  assert.doesNotThrow(() => JSON.stringify(details));
});

test("grenade errors remain nonfatal and preserve diagnostic details", async () => {
  const report = createReport(file);
  const dp = parser(); dp.parseGrenades = () => {throw new Error("Projectile missing");};
  const replay = await parseDemo(bytes, file.name, dp, report);
  finishReport(report);
  assert.equal(replay.rounds.length, 1);
  assert.equal(report.status, "completed");
  assert.equal(report.warnings[0].operation, "parseGrenades");
  assert.equal(report.warnings[0].error.message, "Projectile missing");
  assert.match(report.warnings[0].error.stack, /Projectile missing/);
  assert.equal(report.steps.find(s => s.operation === "parseGrenades").status, "warning");
  assert.ok(replay.warnings.includes(report.warnings[0].message));
});

test("report contains metadata and counts without demo bytes, input path or player/server names", async () => {
  const report = createReport(file);
  await parseDemo(bytes, file.name, parser(), report);
  finishReport(report);
  assert.equal(report.file.name, "match.dem");
  assert.equal(report.context.header.map_name, "de_mirage");
  assert.equal(report.context.header.network_protocol, 123);
  assert.equal(report.context.roundCount, 1);
  assert.equal(report.context.playerSampleCount, 1);
  assert.ok(report.context.requestedTickCount > 0);
  const json = JSON.stringify(report);
  for (const privateText of ["Private", "private demo contents", "steamid", "server_name", "client_name"]) assert.ok(!json.includes(privateText));
});

test("format validation fails before any parser call and identifies the format check", async () => {
  const report = createReport(file);
  try { await parseDemo(new Uint8Array([1,2,3]), file.name, {}, report); }
  catch (error) { failReport(report, error); }
  assert.equal(report.operation, "validateSignature");
  assert.equal(report.status, "failed");
  assert.match(report.error.message, /uncompressed CS2/);
});

test("cancelled imports are distinguished from parser failures", () => {
  const report = createReport(file);
  beginStep(report, "Reading selected file", "File.arrayBuffer");
  finishReport(report, "cancelled");
  assert.equal(report.status, "cancelled");
  assert.equal(report.steps[0].status, "cancelled");
  assert.equal(report.error, null);
});

test("diagnostic build metadata matches the shipped app and parser", () => {
  const read = name => JSON.parse(fs.readFileSync(new URL(name, import.meta.url)));
  const build = read("../web/build-info.json");
  assert.equal(build.app.version, read("../package.json").version);
  assert.equal(build.parser.revision, read("../web/vendor/sources.json").demoparser);
});
test("compiled parser files match diagnostic fingerprints",async()=>{
 const {createHash}=await import("node:crypto");
 const build=JSON.parse(fs.readFileSync(new URL("../web/build-info.json",import.meta.url)));
 assert.equal(build.parser.buildType,"compiled-from-source");
 for(const [key,name] of [["wasmSha256","demoparser2_bg.wasm"],["bindingsSha256","demoparser2.js"],["compatibilityPatchSha256","patches/wasm-compatibility.patch"]])assert.equal(createHash("sha256").update(fs.readFileSync(new URL("../web/vendor/"+name,import.meta.url))).digest("hex"),build.parser[key]);
});
