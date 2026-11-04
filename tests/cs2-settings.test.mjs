import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {backupSettings, restoreSettings, cfgDirs, RECORDING_LAUNCH_ARGS} from "../recorder/cs2-settings.mjs";
import {DEFAULTS} from "../recorder/record-clips.mjs";

test("settings are backed up and restored byte for byte", () => {
  const steam = fs.mkdtempSync(path.join(os.tmpdir(), "ss-steam-")), cfg = path.join(steam, "userdata", "123", "730", "local", "cfg");
  fs.mkdirSync(cfg, {recursive: true});
  fs.writeFileSync(path.join(cfg, "cs2_machine_convars.vcfg"), '"volume" "0.8"');
  fs.writeFileSync(path.join(cfg, "cs2_video.txt"), '"setting.defaultres" "2560"');
  assert.deepEqual(cfgDirs(steam), [cfg]);
  const backup = backupSettings(steam, path.join(steam, "backups"));
  fs.writeFileSync(path.join(cfg, "cs2_machine_convars.vcfg"), '"volume" "0.4"');
  fs.writeFileSync(path.join(cfg, "cs2_video.txt"), '"setting.defaultres" "1920"');
  assert.equal(restoreSettings(backup), 2);
  assert.equal(fs.readFileSync(path.join(cfg, "cs2_machine_convars.vcfg"), "utf8"), '"volume" "0.8"');
  assert.equal(fs.readFileSync(path.join(cfg, "cs2_video.txt"), "utf8"), '"setting.defaultres" "2560"');
  fs.rmSync(steam, {recursive: true, force: true});
});

test("recording profile changes no persistent settings", () => {
  assert.deepEqual(DEFAULTS.setupCommands, []);
  for (const a of ["-w", "-h", "-windowed", "-fullscreen", "-width", "-height"]) assert.ok(!RECORDING_LAUNCH_ARGS.includes(a), a);
  assert.ok(RECORDING_LAUNCH_ARGS.includes("-allow_third_party_software"));
});
