# HANDOFF
_Updated 2026-10-30 (Claude headless task a88b7a26)_
Task a88b7a26: wrote `review-out/uncommitted-1.2.0-summary.md` (file list, commit split). Built from
git status/stat only; per-file diffs were blocked by approval. Nothing committed.

## Current task
Instructive rounds + clip timestamps: done, tested, committed (48a4b62). Recorder (actual clip recording)
remains blocked: normal Steam launch without `-insecure` also exited during demo loading twice.
Frank authorized this run; 0/13 clips recorded. See `review-out/desktop-record-report.md` (attempt 2).
CS2 exited; all 12 settings files restored and byte-verified. OBS remains running, recording inactive.

## Done
- `web/review/engine/instructive.mjs` + `scripts/instructive-rounds.mjs`: per-round categories for one
  player (mistakes and good examples), score, rank, cap 8 (min 2 of each kind), clip windows (6 s lead,
  3 s tail, merged), recording plan in the "Export clips" format, Markdown report in Git-ignored review-out/.
- Run: `node scripts/instructive-rounds.mjs <demo|folder>` (.dem/.dem.zst/.dem.gz; player from recorder.json).
  Needs Node >= 22.15 for .zst; the Codex runtime node (v24) works:
  `%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe`.
- Fixed: CS2 demos report round winners as "T"/"CT", the engine compared against 2/3, so every round
  counted as lost (instructive picks, clutch decisions, win-probability). Shared `winnerTeam()` in util.mjs.
- First real demo (FACEIT, de_cache, 13-4 win) gives 8 picks in ~20 s; results checked against FACEIT stats.
- Tests 94/94.

## Uncommitted on purpose
- `web/core.mjs` also normalises the winner ("T"/"CT" -> 2/3) and uses `round_end.reason`, which fixes the
  viewer's "Incomplete" round labels. The file carries the unapproved local 1.2.0 work, so it stays
  uncommitted with the rest of 1.2.0 until Frank asks.

## Next steps
- Per-match patterns (same killer / same spot repeatedly) on top of single rounds.
- Retest the recorder after the next CS2 patch, then record the plan.json clips.
- Regenerate verification/package-manifest.json (new web/ file) before the next package check.

## Open issues
- Weak heuristics: buy vs team economy, saved weapon, isolation, 5 s trade window, clutch ignores disconnects.
- Public release publication remains UNAPPROVED. Never commit demos, review-out/ or steamids (public repo).
