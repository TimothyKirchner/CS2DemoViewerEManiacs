# HANDOFF
_Updated 2026-10-29 (claude, hub task 15290efc "instructive rounds + clip timestamps")_

## Current task
Task 15290efc: find Frank's ("Kampu") most instructive rounds per demo and write clip timestamps.
Code is WRITTEN BUT NOT RUN, NOT COMMITTED: the headless session had no shell permission (every
Bash/PowerShell call, even `git status`, needed approval). Recorder blocker unchanged (HANDOFF_REVIEW.md).

## Done (uncommitted, all new or review-only files)
- `web/review/engine/instructive.mjs`: per-round categories for one player, score, rank, cap (default 8,
  min 2 mistakes + 2 good examples), clip windows (6 s lead / 3 s tail, merged), recording plan via
  `buildRecordingPlan` (same format as "Export clips"), Markdown report.
- `scripts/instructive-rounds.mjs`: CLI; .dem/.dem.zst/.dem.gz/folders; unpacks to %TEMP%\strat-scope-demos
  (refuses repo paths); player default = recorder.json "player"; writes `<demo>.rounds.json`,
  `<demo>.plan.json`, `<demo>.md` to Git-ignored `review-out/`.
- `tests/instructive.test.mjs` (synthetic events). `.gitignore`: review-out/, *.zst, *.dem.zst, *.dem.gz.
- Docs: recorder/README.md section "Instructive rounds", AGENTS.md command line.

## Next steps (needs an agent/human with shell permission)
1. Run `node --test --test-reporter=dot tests/*.test.mjs tests/*.test.cjs`; fix failures (new tests unverified).
2. Smoke: `node scripts/instructive-rounds.mjs ../public-test.dem --player <any name in it>`.
3. Commit ONLY: .gitignore, AGENTS.md, HANDOFF.md, recorder/README.md, scripts/instructive-rounds.mjs,
   tests/instructive.test.mjs, web/review/engine/instructive.mjs. Push branch. Leave 1.2.0 files alone.
4. `hub task done 15290efc --note "..."` (not run yet).
5. On Frank's demo: `node scripts/instructive-rounds.mjs C:\Users\timot\Documents\CS2Demos\faceit`.

## Open issues
- .zst needs Node >= 22.15 (zlib.zstdDecompressSync) or a `zstd` CLI; Codex runtime node version unchecked.
- Weak heuristics: buy vs team economy (approx prices, sampled at buy end), saved weapon, isolation, trade
  window (5 s, killer death only). Clutch counts only alive players from death events (no disconnects).
- Recorder `--plan` needs `--demo <unpacked .dem>`; the report prints the full command.
- New web/ file: regenerate verification/package-manifest.json before the next package check.
- Recorder still blocked (-insecure crash). Release publication UNAPPROVED; do not publish.
- Local 1.2.0 work still uncommitted; commit only when Frank asks.
