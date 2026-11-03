# HANDOFF
_Updated 2026-11-03 (Claude, hub task 3de4a075, opponent analyser 1/5)_

## Current task
Opponent analyser on branch `feature/opponent-analyser`. Task 1/5 (opponent mode + roster detection) done.
Tasks 2-5 queued in the hub (e6cfeb38, e0038ccf, 48b4252e, 70ed7d0c); plan in Git-ignored
`review-out/opponent-analyser-plan.md`.

## Done (task 1)
- `web/opponent.mjs`: `detectOpponent(entries, overrides)` finds the target team by SteamID. Core = in >= 50%
  of included demos; candidates that shared a roster form one team, strongest group wins (manual core
  overrides add weight, so one "core" mark resolves an ambiguous single demo). A demo belongs to the team
  when >= 3 roster players are core. Returns roster (core/stand-in, "stand-in, 1 of 4 demos", demos,
  rounds, maps, latest name), matched demos (team key, start side, side per round), unmatched demos with
  reason, excluded demos, map groups. `demoRosters(replay)`, `opponentRounds(entries, detection)` give
  per-round side refs for tasks 2-5. `normalizeOverrides({core, standIn, excluded})`.
- Session bundle: optional `opponent` overrides field (`sessionBundle(entries, clips, overrides)`,
  `readBundle(...).opponent`); app remaps excluded entry IDs on import.
- UI: header button "Analyse opponent" and a session tab (`web/opponent-ui.mjs`): import button, status,
  maps, roster table with Auto/Core/Stand-in override, demo table with include checkbox.
- `scripts/opponent-roster.mjs <demo|folder> [--json out]`: real-demo check via the parser (local output).
- Tests: `tests/opponent.test.mjs` (synthetic IDs only), session smoke covers the tab; all unit tests,
  viewer smoke and session smoke pass.
- Real check (4 FACEIT demos in Downloads/demos/28_10, ~105 s parse): 4/4 demos matched, not ambiguous;
  5 core (4 in 4/4, 1 in 3/4) + 1 stand-in (1 of 4); de_ancient 3 demos, de_anubis 1; side switch seen in
  every demo. Local output: review-out/opponent-roster.txt/.json (names, IDs; never commit).

## Next steps
- Task 2 (buy-type round library) builds on `opponentRounds()` + buy labels in core.mjs/analysis.mjs.
- Per-player tendencies must use `detection.core` only and say so; team stats use all matched rounds.
- Regenerate verification/package-manifest.json (new web/opponent*.mjs files) before the next package check.

## Open issues
- Smoke tests rewrite verification/*.png; restore them (`git checkout -- verification/`) unless updating.
- Weak heuristics: buy vs team economy, saved weapon, isolation, 5 s trade window, clutch ignores disconnects.
- Recorder blocked (CS2 exits while loading demos); retest after the next CS2 patch.
- Public release remains UNAPPROVED. Never commit demos, review-out/ or SteamIDs/names (public repo).
