# HANDOFF
_Updated 2026-11-03 (Claude, hub task e0038ccf, opponent analyser 3/5)_

## Current task
Opponent analyser on branch `feature/opponent-analyser`. Tasks 1 (roster), 2 (buy-type library) and 3
(positions and setups) done. Tasks 4-5 queued in the hub (48b4252e, 70ed7d0c); plan in Git-ignored
`review-out/opponent-analyser-plan.md`.

## Done (task 3)
- Parser: `last_place_name` added to `PLAYER_PROPS`; each frame player has `place` (interned callout string).
  WASM untouched. Saved .strats/sessions without `place` still work (callout shows "unknown").
- `web/opponent-positions.mjs`: `positionHeatmap` (team or one core player; windows 0-20 s, 20-45 s, 45 s+;
  reuses `aggregateHeatmap`, plus callout time shares), `sideSetups`/`positionAnalysis` (per map: CT setups
  at 15 s and T defaults at 20 s as "A 2 / mid 1 / B 2" with % of rounds, spot holders, core players' usual
  spot, AWP spots, rotations = zone change setup -> plant + 5 s or 45 s), `filterRounds` (buy type from
  `buyLibrary(...).rounds`, score leading/tied/trailing via `roundScores`), `zoneOf` (BombsiteA/B callout,
  then site anchors within 1400, else mid). A stand-in on the usual spot of an absent core player is
  labelled "filled by stand-in (usually <name>)"; per-player rows are core players only.
- UI: "Positions and setups" in the Analyse opponent tab (map/side/buy/score/time/player filters, radar heatmap,
  callout table, setup/spot/player/AWP/rotation tables with ▶ example rounds, heuristics listed).
- `web/maps/maps.json`: de_anubis site anchors (median of BombsiteA/B callout samples; method reproduces
  de_ancient's anchors within ~60 px).
- `scripts/opponent-positions.mjs <demo|folder> [--json out]`: real-demo check, counts only.
- Tests: `tests/opponent-positions.test.mjs`; 117/117 unit tests, viewer smoke and session smoke pass.
- Real check (4 FACEIT demos, ~105 s): 4/4 matched, 87 rounds, callout on 99.98% of 1.42 M samples.
  de_ancient CT 23 rounds / 9 setups (top 7 of 23), T 36 / 20 setups; de_anubis CT 15 / 8, T 13 / 9.
  Filled by stand-in: ancient CT 4, T 1. AWP rounds: ancient CT 6, T 13; anubis CT 4, T 5.
  Score filter: leading 54, tied 15, trailing 18. Local output: review-out/opponent-positions.json.

## Next steps
- Task 4 (tendencies) can reuse `zoneOf`, `roundScores`, `filterRounds` and frame `place` callouts.
- Regenerate verification/package-manifest.json (new web/opponent*.mjs files) before the next package check.

## Open issues
- Weak heuristics: 1400-unit site radius makes de_ancient CT "mid" rare; rotations look high there
  (41 in 20 CT rounds). Consider callout-to-zone tables per map if Frank finds the tables noisy.
- Smoke tests rewrite verification/*.png; restore them (`git checkout -- verification/`) unless updating.
- Recorder blocked (CS2 exits while loading demos); retest after the next CS2 patch.
- Public release remains UNAPPROVED. Never commit demos, review-out/ or SteamIDs/names (public repo).
