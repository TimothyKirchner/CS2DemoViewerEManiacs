# HANDOFF
_Updated 2026-11-05 (Claude, opponent heatmap hold spots)_

## Current task
Opponent analyser on branch `feature/opponent-analyser`; PR #2 to main open:
https://github.com/TimothyKirchner/CS2DemoViewerEManiacs/pull/2. Nothing in progress.

## Done (2026-11-05)
- Positions heatmap (Analyse opponent tab) now defaults to "Hold spots (standing still)":
  `positionHeatmap(..., {mode:'holds'})` in `web/opponent-positions.mjs` counts samples where a player moves
  < 80 u/s, a cell counts for a round after >= 1 s held, round counts include the 8 neighbour cells (96-unit
  cells), only local peaks are kept, spots under 20 % of rounds (or 1 round with 3+ rounds) are dropped.
- UI: new "Show" select (Hold spots / All movement); hold dots sized/coloured by share of rounds, % labels on
  spots >= 35 %; "all movement" no longer has a 15 % opacity floor (cells < 5 % of max hidden).
- Test added (130/130 pass). Real check, 4 demos in Downloads/demos/28_10: CT ancient 0-20 s went from 278
  painted cells to 5 hold spots (top 65 %), anubis 291 -> 6 (top 67 %).

## Done earlier (task 5)
- Anti-strat report, veto suggestion, side habits, economy/stand-in notes, report script; see git log.

## Next steps
- Frank: look at the hold-spot radar in the app (not checked visually yet), then merge PR #2.
- Regenerate verification/package-manifest.json (new web/opponent*.mjs files) before the next package check.

## Open issues
- Hold thresholds (80 u/s, 1 s, 20 %) are heuristics; tune after visual review.
- Callout table under the radar still uses all movement time, not hold time.
- Zones: 1400-unit site radius puts some mid callouts (anubis Middle, ancient Outside) into a site zone.
- Veto uses only opponent results; 1 anubis demo. Timeout caller not in parsed data.
- Recorder blocked (CS2 exits while loading demos). Public release remains UNAPPROVED.
- Node is not on PATH: use C:\Users\timot\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe
- Never commit demos, review-out/ or SteamIDs/names (public repo).
