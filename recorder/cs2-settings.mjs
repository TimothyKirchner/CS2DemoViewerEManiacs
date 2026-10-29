// Protects the player's own CS2 settings around recorder runs: CS2 writes archived convars (volume, video,
// keys) back to Steam userdata when it exits, so every file there is backed up before launch and restored
// after CS2 has closed. Backups live in %LOCALAPPDATA%\StratScope\cs2-settings-backup\<timestamp>.
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {sleep} from "./netcon.mjs";

// Launch arguments for recording. Nothing here persists: no -w/-h/-windowed (those rewrite cs2_video.txt).
// -insecure opens the VConsole port; -allow_third_party_software lets OBS Game Capture hook CS2.
export const RECORDING_LAUNCH_ARGS = ["-insecure", "-allow_third_party_software", "-console", "-novid"];

export function steamRoot(cs2Exe) { return path.resolve(path.dirname(cs2Exe), "..", "..", "..", "..", "..", ".."); }

// Every Steam account's CS2 cfg folder (userdata/<accountId>/730/local/cfg).
export function cfgDirs(steamDir) {
  const userdata = path.join(steamDir, "userdata");
  if (!fs.existsSync(userdata)) return [];
  return fs.readdirSync(userdata).map(id => path.join(userdata, id, "730", "local", "cfg")).filter(d => fs.existsSync(d));
}

export function backupRoot() { return path.join(process.env.LOCALAPPDATA ?? path.join(process.env.HOME ?? ".", ".local"), "StratScope", "cs2-settings-backup"); }

export function backupSettings(steamDir, root = backupRoot()) {
  const dest = path.join(root, new Date().toISOString().replace(/[:.]/g, "-"));
  const dirs = cfgDirs(steamDir);
  for (const dir of dirs) {
    const to = path.join(dest, path.relative(steamDir, dir));
    fs.mkdirSync(to, {recursive: true});
    for (const f of fs.readdirSync(dir, {withFileTypes: true})) if (f.isFile()) fs.copyFileSync(path.join(dir, f.name), path.join(to, f.name));
  }
  fs.writeFileSync(path.join(dest, "manifest.json"), JSON.stringify({steamDir, dirs, created: new Date().toISOString()}, null, 1));
  return dest;
}

// Copies the backed-up files back over the live ones (files CS2 created meanwhile are left alone).
export function restoreSettings(backup) {
  const {steamDir, dirs} = JSON.parse(fs.readFileSync(path.join(backup, "manifest.json"), "utf8"));
  let restored = 0;
  for (const dir of dirs) {
    const from = path.join(backup, path.relative(steamDir, dir));
    for (const f of fs.readdirSync(from)) { fs.copyFileSync(path.join(from, f), path.join(dir, f)); restored++; }
  }
  return restored;
}

export const cs2Running = () => {
  if (process.platform !== "win32") return false;
  try { return /cs2\.exe/i.test(execFileSync("tasklist", ["/FI", "IMAGENAME eq cs2.exe", "/NH"], {encoding: "utf8"})); } catch { return false; }
};
export async function waitForCs2Exit(timeoutMs = 90000) {
  const until = Date.now() + timeoutMs;
  while (cs2Running()) { if (Date.now() > until) return false; await sleep(1000); }
  await sleep(3000); // let CS2/Steam finish writing config files
  return true;
}
