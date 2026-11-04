# HANDOFF
_Updated 2026-11-03 (Claude, hub task 70ed7d0c, opponent analyser 5/5)_

## Current task
Opponent analyser on branch `feature/opponent-analyser` is complete (tasks 1-5). Nothing in progress.
Branch is pushed; PR #2 to main is open (2026-11-04, no conflicts, no CI checks): https://github.com/TimothyKirchner/CS2DemoViewerEManiacs/pull/2

## Done (task 5)
- `web/opponent-report.mjs`: `opponentMapResults` (rounds, sides, match W/L per map), `vetoSuggestion` (ban their
  strongest, pick their weakest; unseen pool maps listed as unknown; editable `DEFAULT_POOL`), `sideHabits`
  (anchors, default setup, AWP spot, stacks, retakes, openings, opening spots >= 70 % / <= 30 %, low trades, utility
  timings, T full-buy plant site, clutch player; each with sample, counter idea, evidence refs, heuristic flag,
  "small sample" under 10 rounds), `economyNotes`, `standInNotes`, `antiStratReport`, `renderAntiStrat`
  (Markdown, standalone HTML, or fragment with ▶ `data-play` buttons).
- `prepReport` takes `sections` (pre-rendered parts); the scouting prep export appends the anti-strat page.
- `sideSetups` player rows now carry `evidence` (rounds on their usual spot).
- UI: "Anti-strat report" section in the Analyse opponent tab (title, map pool, Build report, Export Markdown/HTML).
- `scripts/opponent-report.mjs <demo|folder> --md out --html out` (console prints counts only).
- Tests: `tests/opponent-report.test.mjs` (5 tests); 129/129 unit tests; session smoke (report preview assert) and
  viewer smoke pass; verification/*.png restored.
- Docs: README feature bullet, LOCAL_REVIEW "Opponent analyser" section.
- Real check (4 demos in Downloads/demos/28_10): 4/4 matched, 87 rounds, 31 habits, veto ban ancient / pick anubis.
  Report and review in Git-ignored `review-out/opponent-report-test.md`.

## Next steps
- Frank: review `review-out/opponent-report-test.md` and the tab; then merge PR #2.
- Regenerate verification/package-manifest.json (new web/opponent*.mjs files) before the next package check.

## Open issues
- Zones: 1400-unit site radius puts some mid callouts (anubis Middle, ancient Outside) into a site zone.
- Wide utility time ranges (one cluster mixes early/late smokes) make the "fixed time" counter too strong.
- Veto uses only opponent results; 1 anubis demo. Timeout caller not in parsed data.
- Recorder blocked (CS2 exits while loading demos). Public release remains UNAPPROVED.
- Never commit demos, review-out/ or SteamIDs/names (public repo).
