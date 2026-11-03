# HANDOFF
_Updated 2026-11-03 (Claude, hub task 48b4252e, opponent analyser 4/5)_

## Current task
Opponent analyser on branch `feature/opponent-analyser`. Tasks 1 (roster), 2 (buy-type library),
3 (positions and setups) and 4 (tendencies) done. Task 5 (anti-strat report, hub 70ed7d0c) is next; plan in
Git-ignored `review-out/opponent-analyser-plan.md`.

## Done (task 4)
- `web/opponent-tendencies.mjs`: `duelTendencies` (opening duels by callout/zone and core player, round win
  after opening kill/death, trades within 5 s incl. "X for Y" pairs), `stackTendencies` (CT >= 3 / T >= 4 on one
  site at the setup sample; plants, post-plant wins, CT retakes = no living CT on the plant site at the plant),
  `utilityClusters` (smoke/molly/flash/HE landings, greedy radius clusters, median and 25-75 % time, callout,
  throwers), `economyHabits` (next-round buy after lost T/CT pistol, won pistol, lost buy/eco, won buy; saves),
  `playerTendencies` (computeStatistics on target side: openings, trades, clutches, core only),
  `timeoutTendencies` (freeze time >= median + 20 s; likely caller = team on a 2+ losing streak),
  `tendencyAnalysis` (all of it plus heuristic notes).
- UI: "Tendencies" section in the Analyse opponent tab (map/side filter, ▶ example rounds, sample sizes).
- `scripts/opponent-tendencies.mjs <demo|folder> [--json out]`: real-demo check, counts only.
- Tests: `tests/opponent-tendencies.test.mjs`; 124/124 unit tests; session smoke (new tendencies asserts) and
  viewer smoke pass.
- Real check (4 FACEIT demos, ~105 s): 4/4 matched, 87 rounds. Openings won: ancient T 21/36, CT 13/23;
  anubis T 7/13, CT 7/15. Deaths traded 18-30 %. Stacks: ancient CT 11/23 (all A), anubis CT 9/15.
  Retakes: ancient 1, anubis 4. Smoke clusters 4-8 per map/side. Clutches eligible on 77/87 rounds.
  Economy: after lost T pistol 1/2 force/half; non-pistol buys 79 (eco 4, force 7, half 6, full 56, anti-eco 6);
  saves 7/34. Timeouts: 7 in 78 checked rounds (two at 140 s look like pauses). Output: review-out/opponent-tendencies.json.

## Next steps
- Task 5: extend prepReport into a per-map "how to beat them" page from buyLibrary, positionAnalysis and
  tendencyAnalysis; evidence links; veto suggestion; HTML/Markdown export.
- Regenerate verification/package-manifest.json (new web/opponent*.mjs files) before the next package check.

## Open issues
- Timeout caller is not in the parsed data (no gamerules props); long technical pauses also count.
- Weak heuristics: 1400-unit site radius makes de_ancient CT "mid" rare (stacks show A only there).
- Smoke tests rewrite verification/*.png; restore them (`git checkout -- verification/`) unless updating.
- Recorder blocked (CS2 exits while loading demos); retest after the next CS2 patch.
- Public release remains UNAPPROVED. Never commit demos, review-out/ or SteamIDs/names (public repo).
