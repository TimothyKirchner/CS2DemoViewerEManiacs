# HANDOFF
_Updated 2026-11-05 (Claude, opponent heatmap hold spots)_

## Current task
Opponent analyser on branch `feature/opponent-analyser`; PR #2 to main open:
https://github.com/TimothyKirchner/CS2DemoViewerEManiacs/pull/2. Nothing in progress.

## Done (2026-11-05)
- Positions radar (Analyse opponent tab) defaults to "Hold spots": `positionHeatmap(..., {mode:'holds'})` in
  `web/opponent-positions.mjs`. Per player and round it finds dwells (moving < 80 u/s, >= 2 s, new dwell when
  standing still > 110 units away), clusters dwells across rounds (220 units, 120 z for floors), and keeps
  spots seen in 2+ rounds with >= 10 % team share or >= 25 % of one player's own rounds (per-player idea from
  FACEIT Mappio, whose method is not public). Each spot: callout, team share, main holder + share of his rounds.
- UI: numbered dots coloured by main player (grey = stand-in), table # / callout / team rounds / main player /
  others; "Show" select keeps "All movement" (no 15 % opacity floor now).
- Real check (Downloads/demos/28_10): 6-17 spots per CT window instead of 278-413 painted cells.
- Tests 130/130; session smoke passes (select count 6 -> 7 fixed; it broke in 24db5fc).

## Done earlier (task 5)
- Anti-strat report, veto suggestion, side habits, economy/stand-in notes, report script; see git log.

## Next steps
- Frank: look at the hold-spot radar in the app (not checked visually yet), then merge PR #2.
- Regenerate verification/package-manifest.json (new web/opponent*.mjs files) before the next package check.

## Open issues
- Hold thresholds (80 u/s, 2 s, 220 units, 10 % / 25 %) are heuristics; tune after Frank's visual review.
- Zones: 1400-unit site radius puts some mid callouts (anubis Middle, ancient Outside) into a site zone.
- Veto uses only opponent results; 1 anubis demo. Timeout caller not in parsed data.
- Recorder blocked (CS2 exits while loading demos). Public release remains UNAPPROVED.
- Node is not on PATH: use C:\Users\timot\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe
- Never commit demos, review-out/ or SteamIDs/names (public repo).
