# HANDOFF
_Updated 2026-10-28 (migrated verbatim from ../HANDOFF_CURRENT.md of 2026-10-26)_

## Current task
Automated review + recorded clips in progress on branch claude/cs2-demo-3d-review-1tkt4m: see HANDOFF_REVIEW.md.
2026-10-28: recorder works over CS2 VConsole2 + OBS (HLAE blocked by FACEIT/Vanguard). First real recording run in progress; 1.2.0 work still uncommitted on top of the branch.
No active work remains from the requested local feature expansion. Version 1.2.0 implemented and locally built; parent contains Strat-Scope-1.2.0-Windows-x64.exe and Strat-Scope-1.2.0-Source.zip. Executable copy SHA-256 verified; ZIP byte-verified.

## Done
- Compact 18px equipment icons using actual Valve CS vectors, preserving native proportions; no weapon captions/card borders. Source pinned and attributed in THIRD_PARTY_NOTICES.txt.
- Simple multi-demo import session, sequential queue, cancellation, per-file failure continuation, content deduplication, match switch/removal. No database/cloud.
- User-assigned team names/dates; combined map/team/player/side/buy/result/date filters.
- Editable timed clips/bookmarks, tags/notes, ordered cross-match playback, session bundle import/export (.stratsession) for offline sharing.
- Stats: K/D/A, ADR/KAST, opening duels/trades/clutches, flash and utility damage, map/weapon/economy splits, imported-player rankings. Added player_hurt and pitch parsing; explicit coverage prevents invented rates for legacy/partial data.
- Cross-match occupancy heatmaps, drag/coordinate area queries, coarse recurring opening/path/utility candidates, evidence navigation, observed role hints, map results, manual veto scenarios, editable HTML/Markdown prep reports.
- Per-match local voice attachment/offset/volume synchronized with replay transport; reattach audio after session import.
- Position/angle copy and kill navigation shortcuts. Existing viewer/scouting features retained.
- Validation: 69 unit tests pass. tests/session-smoke.cjs and tests/viewer-smoke.cjs --demo ../public-test.dem pass; real WASM metrics: 9 eligible rounds, 258 hurt events, 6822 capped enemy damage, 62 enemy kills, 118 separate post-round events. 55 packaged application files + docs verified; screenshots in verification/.

## Next steps
- Changes remain UNCOMMITTED. GitHub main last pushed at 2e045ff4ff3212de6d66805f59f23fc95a583e3d. Commit the 1.2.0 work when the user asks; do not describe new features as pushed.
- Later: 3D automated demo review tool reusing the parser.

## Open issues
- Genuine POV/current ESEA/multi-map fidelity not exhaustively tested. Unknown visibility restricts outcome/damage stats. Roles/patterns are heuristics; veto is manual. Utility geometry remains approximate.
- Public release publication was rejected by automatic approval review and remains UNAPPROVED. Do not publish/retry without explicit user approval. The old parent .github-release.cjs targets the old release and must not be run blindly.
