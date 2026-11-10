# HANDOFF
_Updated 2026-11-10 (Claude, coach review loop for both analysers)_

## Current task
Coach-evaluate-improve loop on branch `feature/coach-loop` (pushed, 20+ small commits). Persona prompts in
`scripts/coach-persona.md` (ESEA anti-strat coach; self-review coach). Every round's report and verdict are
in Git-ignored `review-out/coach-rounds/opponent/rN/` and `review-out/coach-rounds/review/rN/`.
PR to main still to open: https://github.com/TimothyKirchner/CS2DemoViewerEManiacs/compare/main...feature/coach-loop
(gh CLI missing; the Claude browser pane was not signed in to GitHub on 10 Nov).

## Coach trajectory
- Opponent analyser (4 demos of one opponent, Downloads/demos/28_10): r1 5.5, r2 6.8, r3 7.3, r4 7.8,
  r5 8.0 satisfied. Fixed: mid callouts (Middle, Outside, Canal, spawns, T-side routes) never count as a
  site; "fixed timing" only for <= 4 s windows in 5+ rounds; no raw coordinates; opening duels need a
  15-point edge; trades compared with their opponents' rate (10 points); no counter text below 8 rounds;
  wording follows the numbers; per-map top reads; T starts per player; plant split with even-split
  handling; side-aware utility counters; "Site left empty at the plant"; veto flags single-demo maps.
- Review engine (Frank's anubis demo 357f8183): r1 5.8, r2 7.0, r3 7.8, r4 8.0 satisfied, r5 confirmation
  after a fix (see verdict file). Fixed: death causes (you/killer callout, distance in units and metres,
  flash evidence, teammate distance, unused grenade types, cause-specific look-at), 12 s death lead, max 4
  death picks and max half highlights, buy type, bomb timer after the plant, win-chance swing (model
  estimate), rating and benchmark definitions, cross-round patterns, post-plant causes.
- A regression (won T post-plants labelled as retakes) slipped into one commit and was fixed with a test.

## Next steps
- Open the PR and merge when tests pass (Frank approved merging). Rerun `tests/session-smoke.cjs` in Electron.
- Remaining coach asks (not blocking): ancient T utility and hit-site by buy type, pistol setups, evidence on
  plant-split/economy rows, decisions/scope component breakdown, picks sorted by win-chance swing.

## Open issues
- Tests 140/140 with the bundled node: C:\Users\timot\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe
- `scripts/opponent-report.mjs --cache review-out/cache` reruns in ~3 s (cache 337 MB, Git-ignored).
- Never commit demos, review-out/ or SteamIDs/names (public repo).
