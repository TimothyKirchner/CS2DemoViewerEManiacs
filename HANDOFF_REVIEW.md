# HANDOFF — automated review + recorded clips
_Written 2026-10-28 by the cloud session for the local PC instance. Branch: `claude/cs2-demo-3d-review-1tkt4m`._

## Goal (from Frank)
Parse demos to judge play (mechanics + decisions), cut instructive moments into clips with critiques
(like Leetify highlights), and give a rating beyond box stats. Chosen output: **recorded video clips**
(CS2 + HLAE, critiques burned in). The 3D viewer should also be finished.

## Merge note
This branch is based on `f0ca576` (1.1.1). The local 1.2.0 work is UNCOMMITTED on the PC: commit or stash it
before checking out/merging this branch. Only `web/index.html` (one "3D Review" header link) overlaps.

## Done (all in `web/review/`, tests in `tests/`)
- `parse-review.mjs`: second parser pass. `player_hurt` + `weapon_fire` with pitch/velocity, and dense
  samples (every 2 ticks, 3 s before → 0.25 s after each hit/kill) with `approximate_spotted_by`, ducking, scoped.
  Verified on public-test.dem: 258 hurts, 1482 shots, 8625 dense ticks, pitch/spotting/velocity all present.
- `engine/`: `win-probability.mjs` (heuristic model), `mechanics.mjs` (duels; crosshair angle at spot onset,
  spot→shot reaction, spot→damage, counter-strafe speed at shots, accuracy, HS), `decisions.mjs` (dry opening,
  isolated, missed trade (LOS-aware), re-peek while damaged, multi-exposure, unused utility, no-save, team flash;
  highlights: trade, flash assist, multikill, clutch, clean duel), `rating.mjs` (HLTV 1.0 exact, HLTV 2.0
  community approximation, WPA impact, decision score, composite Scope Rating), `clips.mjs` (clusters findings
  per player/round into clips with tips), `review.mjs` (entry: `reviewReplay(replay,{detail})`),
  `clip-plan.mjs` (clips → recording plan: ticks, accountId for `spec_player_by_accountid`, SRT critiques).
- 3D viewer: `index.html`, `review.mjs`, `scene3d.mjs`, `review.css`, `review-worker.js`; three.js 0.169
  vendored at `web/vendor/three.module.min.js` (MIT, `three-LICENSE.txt`). Loads .dem (worker), .strats
  (coarse review), .scopereview (gz JSON {format:"strat-scope-review",replay,detail}). Orbit/POV/chase/top
  cameras, spotting lines, tracers, utility, win-prob timeline, critique pause. Screenshot: `verification/review-3d.png`.
- Real demo (browser worker) ~20 s; engine ~45 ms. Unit tests: `tests/review.test.mjs` (8 pass; all 49 pass).
  Integration: `node tests/review-real-demo.mjs ../public-test.dem [--write x.scopereview]`.
- Recorder started: `recorder/netcon.mjs` (CS2 TCP console via `-netconport`), `recorder/obs.mjs` (obs-websocket v5). Untested against a real CS2.

## Next steps
1. **Recorder CLI** `recorder/record-clips.mjs` (not written yet). Intended design:
   - Input `--review x.scopereview` (runs `reviewReplay` + `buildRecordingPlan`, default featured clips;
     `--player`, `--all`, `--only`) or `--plan plan.json`; `--config recorder/recorder.json`; `--dry-run`, `--no-launch`, `--keep-open`.
   - Copy demo to `<cs2>/game/csgo/stratscope_review.dem`; launch via HLAE
     (`HLAE.exe -customLoader -noGui -autoStart -hookDllPath <hlae>\x64\AfxHookSource2.dll -programPath <cs2.exe> -cmdLine "-steam -insecure -novid -console -netconport 2121 -windowed -w 1920 -h 1080"`),
     or plain cs2.exe for OBS mode. **Verify these HLAE flags/paths locally.**
   - Per clip: `demo_pause` → `demo_gototick <startTick>` → `spec_player_by_accountid <id>`; `spec_mode 1` → settle 2 s →
     record start (HLAE: `mirv_streams record name/fps/screen enabled 1/screen settings afxFfmpegYuv420p/start`, keep
     configurable; OBS: `StartRecord`) → `demo_resume` → wait seconds×slowFactor (HLAE fixed-fps is not realtime) → record end.
   - Find newest video in the HLAE output dir (OBS: `StopRecord` returns outputPath); ffmpeg `-t <seconds>` trim and
     `subtitles=clip.srt` burn-in (run with cwd = clip dir to avoid Windows path escaping); keep .srt sidecar on failure.
   - Write `clips.md` index with critiques per file.
   - Open questions to verify on the PC: parser tick == `demo_gototick` tick; whether gototick keeps pause; HLAE
     output layout; `mirv_cmd addAtTick` availability (could end recordings exactly instead of slowFactor waits).
2. UI: "Export clips" button writing `buildRecordingPlan(...)` JSON (and/or an Electron IPC to run the recorder).
3. Finish 3D viewer docs: `web/review/README.md` (method/limits), README.md feature list, THIRD_PARTY_NOTICES
   (three.js MIT r169), `web/vendor/sources.json`, AGENTS commands, then Electron viewer smoke + `verify-package`.
4. Tune: spotting lags real visibility (crosshair/reaction read optimistic); benchmarks in `mechanics.mjs BENCHMARKS`.
   Win-probability coefficients are hand-set; "isolated" fires often on CT anchors (rated low severity).

## Not verified here
Electron smoke tests, packaging and anything involving CS2/HLAE/OBS (cloud container is Linux, no game).
