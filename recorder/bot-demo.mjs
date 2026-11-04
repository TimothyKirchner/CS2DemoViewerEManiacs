#!/usr/bin/env node
// Records a fresh demo of a local 5v5 bot match, for testing the recorder on the current CS2 build.
// Usage: node recorder/bot-demo.mjs [--map de_mirage] [--rounds 6] [--name stratscope_bots]
// CS2 must already run (VConsole2 on port 29000). The demo lands in game/csgo/<name>.dem.
// It changes saved settings (game_type, game_mode, bot_*), so it backs up the CS2 config first, quits CS2 at
// the end and restores the backup. CS2 only writes its config on exit, so the files on disk are still the
// player's own when the backup is taken.
import {VConsole} from "./vconsole.mjs";
import {sleep} from "./netcon.mjs";
import {findCs2} from "./record-clips.mjs";
import {steamRoot, backupSettings, restoreSettings, waitForCs2Exit} from "./cs2-settings.mjs";

const backup = backupSettings(steamRoot(findCs2()));
console.log(`Backed up CS2 settings to ${backup}`);

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const map = arg("--map", "de_mirage"), rounds = Number(arg("--rounds", 6)), name = arg("--name", "stratscope_bots");
const con = await new VConsole().connect(29000);
const run = async (cmds, wait = 300) => { for (const c of cmds) { con.send(c); await sleep(wait); } };

console.log(`Loading ${map} with bots...`);
const loaded = con.waitFor(/Host activate|SV:\s+Spawn Server|ChangeGameUIState: CSGO_GAME_UI_STATE_LOADINGSCREEN -> CSGO_GAME_UI_STATE_INGAME/i, 120000);
await run(["game_type 0", "game_mode 1", `map ${map}`]);
if (!await loaded) console.log("(no load line seen; continuing)");
await sleep(15000);
await run([
  "sv_cheats 1", "bot_quota_mode normal", "bot_quota 10", "bot_difficulty 2", "bot_join_after_player 0",
  "mp_autoteambalance 1", "mp_limitteams 0", "mp_freezetime 3", "mp_roundtime 1.25", "mp_round_restart_delay 3",
  `mp_maxrounds ${rounds * 2}`, "mp_match_can_clinch 0", "jointeam 1", "mp_warmup_end", "mp_restartgame 1"
]);
await sleep(4000);
await run([`record ${name}`, "host_timescale 3"]);
console.log(`Recording ${rounds} rounds at 3x...`);
let done = 0;
const roundEnd = () => con.waitFor(/round_end|Round_End|Terrorists Win|Counter-Terrorists Win|Target (Bombed|Saved)|Bomb Defused/i, 120000);
while (done < rounds) { if (!await roundEnd()) break; done++; console.log(`  round ${done}/${rounds}`); await sleep(1500); }
await run(["host_timescale 1", "stop"]);
await sleep(2000);
console.log((con.log.filter(l => /Recording|Completed demo|demo/i.test(l)).slice(-3).join("\n")) || "stop sent");
await run(["disconnect", "quit"]);
con.close();
if (await waitForCs2Exit()) console.log(`Restored ${restoreSettings(backup)} CS2 settings files`);
else console.log(`CS2 still running; after closing it run: node recorder/record-clips.mjs --restore-settings "${backup}"`);
