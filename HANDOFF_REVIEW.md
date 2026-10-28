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

## Tools on this PC
- CS2: `C:\Program Files (x86)\Steam\steamapps\common\Counter-Strike Global Offensive\game\bin\win64\cs2.exe`.
- ffmpeg 8.0.1 (gyan.dev, libass) on PATH via WinGet. OBS: `C:\Program Files\obs-studio\bin\64bit\obs64.exe`.
- HLAE: NOT installed. Source: https://github.com/advancedfx/advancedfx/releases.
- `node` is not on PATH; use the Codex runtime node (see AGENTS.md).

## Next steps
1. Real recording run of the top 2 clips. Needs Frank's go-ahead before CS2 starts, and either HLAE
   installed (set `hlae.exe` in `recorder/recorder.json`) or OBS mode with the WebSocket server enabled.
2. During that run, verify the open questions: parser tick == `demo_gototick` tick; whether gototick keeps
   the pause (script re-sends `demo_pause`); HLAE output layout (script takes newest video under
   `hlae.outputDir`); HLAE launch flags; `slowFactor`/`leadSeconds` values; `mirv_cmd addAtTick`.
3. Regenerate `verification/package-manifest.json` with a local build + `verify-package` (web/ changed).
4. Tune: spotting lags real visibility; win-probability coefficients are hand-set; "isolated" fires often
   on CT anchors.

## Not verified
Anything that needs CS2/HLAE/OBS running; packaged build of this branch.
