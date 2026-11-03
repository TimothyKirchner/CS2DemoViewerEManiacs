# HANDOFF
_Updated 2026-11-03 (Claude, hub task e6cfeb38, opponent analyser 2/5)_

## Current task
Opponent analyser on branch `feature/opponent-analyser`. Tasks 1 (roster detection) and 2 (buy-type round
library) done. Tasks 3-5 queued in the hub (e0038ccf, 48b4252e, 70ed7d0c); plan in Git-ignored
`review-out/opponent-analyser-plan.md`.

## Done (task 2)
- `web/opponent-buys.mjs`: `buyLibrary(entries, opponentRounds(...), {mapDefs})` classifies every target-team
  round from equipment value (price table, best sample in the first 5 s, 4 players scale to 5): pistol, eco
  (< 5000), full (>= 20000), force (mean bank <= 1000 after buying) or half buy in between, anti-eco (enemy
  < 5000). Post-plant save = lost after a plant with >= 1 survivor (tag; also counted under its buy type).
  Per map and side, each buy type gets sample ("3 of 9 rounds"), win rate, most common route (T: plant site,
  CT: bombsite nearest the first contact, via maps.json anchors), median first contact, utility per round
  and a representative round. Helpers: `playerValue`, `teamValue`, `classifyBuy`, `siteOf`, `roundFacts`.
- UI: "Buy-type round library" section in the Analyse opponent tab (map picker, T/CT tables, ▶ play button
  opens and plays the representative round, heuristics listed under the tables).
- `scripts/opponent-buys.mjs <demo|folder> [--json out]`: real-demo check, prints counts only.
- Tests: `tests/opponent-buys.test.mjs` (synthetic); session smoke checks the library; all unit tests,
  viewer smoke and session smoke pass.
- Real check (4 FACEIT demos in Downloads/demos/28_10, ~100 s parse): 4/4 demos matched, 87 target-team
  rounds: full 56, pistol 8, force 7, half 6, anti-eco 6, eco 4, unknown 0; post-plant saves 6; every round
  has a first contact. de_ancient T 36 / CT 23, de_anubis T 13 / CT 15. Local output: review-out/opponent-buys.json.

## Next steps
- Task 3 (positions and setups) can filter by buy type via `buyLibrary(...).rounds` (type per round ref).
- de_anubis has no site anchors in web/maps/maps.json, so routes there read "site unknown"; add anchors.
- Regenerate verification/package-manifest.json (new web/opponent*.mjs files) before the next package check.

## Open issues
- Smoke tests rewrite verification/*.png; restore them (`git checkout -- verification/`) unless updating.
- Weak heuristics: saved weapons count as bought; force vs half by remaining bank; route only by plant/contact.
- Recorder blocked (CS2 exits while loading demos); retest after the next CS2 patch.
- Public release remains UNAPPROVED. Never commit demos, review-out/ or SteamIDs/names (public repo).
