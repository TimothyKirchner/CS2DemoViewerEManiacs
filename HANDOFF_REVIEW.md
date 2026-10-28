# HANDOFF — automated review + recorded clips
_Updated 2026-10-28 by the local PC session. Branch: `claude/cs2-demo-3d-review-1tkt4m`._

## Goal (from Frank)
Parse demos to judge play (mechanics + decisions), cut instructive moments into clips with critiques
(like Leetify highlights), and give a rating beyond box stats. Chosen output: **recorded video clips**
(CS2 + HLAE, critiques burned in). The 3D viewer should also be finished.

## Working tree note
The local 1.2.0 work was stashed, this branch checked out and the stash popped on top (no conflicts).
It is still UNCOMMITTED and intentionally left out of the review commits. Only review/recorder changes
were committed; README.md and THIRD_PARTY_NOTICES.txt were staged as HEAD plus the review lines only.

## Done
- Engine, 3D viewer and `.scopereview` format: see `web/review/README.md` (method and limits).
- Verified on this PC: 82 unit tests pass; `tests/review-real-demo.mjs ../public-test.dem --write
  ../public-test.scopereview` gives 85 duels, 74 findings, 39 clips (12 featured) in ~7 s; viewer smoke passes.
- `recorder/record-clips.mjs` + `recorder.example.json` + `recorder/README.md`: `--review`/`--plan`, `--top`,
  `--player`, `--all`, `--only`, `--mode hlae|obs`, `--dry-run`, `--no-launch`, `--keep-open`, `--no-burn`.
  Writes `.srt`, `plan.json`, `clips.md` to `<input>-clips/`. cs2.exe auto-found via Steam registry/library.
  Unit tests: `tests/recorder.test.mjs`.
- Dry run on `../public-test.scopereview --top 2` OK. ffmpeg burn-in verified on a synthetic 1080p60
  clip (subtitles readable, trim exact 12.53 s).
- Plan file names: non-Latin player names now use `id<accountId>` instead of a generic `clip` tag.
- UI: "Export clips" in the review header saves `<demo>.clips.json` for the listed clips (verified in the
  browser: 12 featured clips exported).
- Docs: `web/review/README.md`, `recorder/README.md`, README feature list/links, THIRD_PARTY_NOTICES
  (three.js 0.169.0 MIT; HLAE/OBS/FFmpeg not bundled), `web/vendor/sources.json` (three), AGENTS commands.

## Live CS2 findings (2026-10-28)
- CS2 rewrites `-netconport` to `xnetconport` (disabled). The recorder now uses VConsole2 on 127.0.0.1:29000
  (`recorder/vconsole.mjs`; header = type, uint16 version 0xd4, uint32 length, uint16 handle; PRNT text at +28).
  Verified: commands execute and console text comes back.
- FACEIT AC + Riot Vanguard (vgk) are installed: HLAE injection and spawning cs2.exe fail (error 5 / EPERM).
  Frank chose OBS mode (`recorder/recorder.json` mode "obs", WebSocket password there, Git-ignored).
  OBS mode launches via `steam.exe -applaunch 730`; Steam asks to confirm custom launch args.
- Recorder auto-creates OBS scene "Strat Scope CS2" with a Game Capture of the CS2 window.
- CS2 updated on 2026-10-28 to 1.41.9.3 (patch 14193). It refuses older demos ("Error processing network message
  CSVCMsg_ServerInfo"): public-test.dem (13984) and the FACEIT demos in Downloads\demos\28_10 (14189) all fail.
  The recorder now detects this and aborts with a clear error.
- `--review` accepts a `.dem` directly (parsed with the bundled WASM parser).

## Tools on this PC
- CS2: `C:\Program Files (x86)\Steam\steamapps\common\Counter-Strike Global Offensive\game\bin\win64\cs2.exe`.
- ffmpeg 8.0.1 (gyan.dev, libass) via WinGet. OBS: `C:\Program Files\obs-studio\bin\64bit\obs64.exe`.
- HLAE 2.192.10 at `C:\Users\timot\Tools\HLAE` (ffmpeg.ini points to the WinGet ffmpeg); unusable while
  FACEIT/Vanguard drivers run.
- `node` is not on PATH; use the Codex runtime node (see AGENTS.md).

## Next steps
1. Frank (in-game "Kampu", SteamID64 76561198083553699) will produce a post-update demo (CS2 patch >= 14193)
   on 2026-10-29. Recordings focus only on him: `recorder/recorder.json` has `"player"` set to his SteamID,
   which keeps up to 10 clips for him and records all of them. Run:
   `node recorder/record-clips.mjs --review <new>.dem` (ask Frank before starting CS2; Steam must be running;
   accept Steam's launch-args prompt). The demos in Downloads\demos\28_10 are scouting demos without him.
   No public post-update demo existed yet on 2026-10-29 00:00 (last HLTV match started before the build).
   `recorder/bot-demo.mjs` can record a local bot match instead, but CS2 only opened VConsole (29000) when
   launched with `-console` (plus Frank's own launch options); `steam -applaunch 730 -console` triggers a Steam
   prompt that needs a click. NEVER queue/join real games (vconsole.mjs refuses online commands).
2. During that run, verify: parser tick == `demo_gototick` tick (recorder logs `demo_info` after each seek);
   whether gototick keeps the pause; OBS lead trim; subtitle timing against the video.
3. Regenerate `verification/package-manifest.json` with a local build + `verify-package` (web/ changed).
4. Tune: spotting lags real visibility; win-probability coefficients are hand-set; "isolated" fires often
   on CT anchors.

## Not verified
Anything that needs CS2/HLAE/OBS running; packaged build of this branch.
