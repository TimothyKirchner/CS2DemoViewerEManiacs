# HANDOFF
_Updated 2026-11-05 (Claude, opponent heatmap hold spots, local build 1.3.0)_

## Current task
Opponent analyser on branch `feature/opponent-analyser`; PR #2 to main open:
https://github.com/TimothyKirchner/CS2DemoViewerEManiacs/pull/2. Nothing in progress.

## Done (2026-11-05)
- Positions radar (Analyse opponent tab) defaults to "Hold spots": `positionHeatmap(..., {mode:'holds'})` in
  `web/opponent-positions.mjs`. Per player and round it finds dwells: time spent inside a 240x240-unit box
  (jiggles count; out of the box > 1 s starts a new dwell), >= 2 s, not at the player's freeze-end spawn spot; clusters dwells across rounds (220 units, 120 z for floors), and keeps
  spots seen in 2+ rounds with >= 10 % team share or >= 25 % of one player's own rounds (per-player idea from
  FACEIT Mappio, whose method is not public). Each spot: callout, team share, main holder + share of his rounds.
- UI: numbered dots coloured by main player (grey = stand-in), table # / callout / team rounds / main player /
  others; "Show" select keeps "All movement" (no 15 % opacity floor now).
- Real check (Downloads/demos/28_10): CT 0-20 s ancient 17 spots (A 78 %, B 52 %), anubis 18 (Middle 73 %);
  later windows 23-42 spots (noisier: retakes, rotations).
- "Where is the AWP": Players filter "AWP (whoever has it)" (`AWP_PLAYER`) runs the same hold spots on whoever
  on the target side holds or carries an AWP; share = % of AWP rounds, holders = who AWPs there. Real check:
  ancient CT 0-20 s AWP on A 57 % (one player 80 %), anubis Middle 75 %.
- Version 1.3.0 (package.json, lock, README.txt). Local portable build: release/ and parent folder
  `Strat-Scope-1.3.0-Windows-x64.exe`; verify-package passed (80 files), manifest regenerated. Not published.
  Build needs node on PATH (npm.cmd calls node): prepend the Codex node bin dir before build-local.cjs.
- Tests 131/131; session smoke passes (select count 6 -> 7 fixed; it broke in 24db5fc).

## Done earlier (task 5)
- Anti-strat report, veto suggestion, side habits, economy/stand-in notes, report script; see git log.

## Next steps
- Frank: try the 1.3.0 exe (hold-spot radar, AWP filter), then merge PR #2. GitHub release needs his approval.

## Open issues
- Hold thresholds (240 box, 1 s peek, 2 s, 220 units, 10 % / 25 %) are heuristics; tune after Frank's visual review.
- Zones: 1400-unit site radius puts some mid callouts (anubis Middle, ancient Outside) into a site zone.
- Veto uses only opponent results; 1 anubis demo. Timeout caller not in parsed data.
- Recorder blocked (CS2 exits while loading demos). Public release remains UNAPPROVED.
- Node is not on PATH: use C:\Users\timot\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe
- Never commit demos, review-out/ or SteamIDs/names (public repo).
