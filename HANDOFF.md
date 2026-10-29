# HANDOFF
_Updated 2026-10-29 08:05 (claude session 4f8374b4)_

## Current task
Automated review + recorded clips on branch `claude/cs2-demo-3d-review-1tkt4m` (pushed, head a3b6b48).
Details in HANDOFF_REVIEW.md. BLOCKED: CS2's console (VConsole, port 29000) needs `-insecure`, and with
`-insecure` CS2 crashes during demo playback since the 2026-10-28 update (patch 14193). No clip with game
footage recorded yet. Needs Frank's decision on the next approach; do not start CS2 without asking him.

## Done
- Review engine, 3D viewer, Export clips button, recorder (OBS mode, VConsole, player focus, .dem input), docs.
- Unit tests 85/85. Recorder refuses online/matchmaking commands; never queue or join real games.
- Frank is "Kampu" (SteamID64 76561198083553699); recorder.json focuses on him (Git-ignored file).

## Next steps
- Retest after the next CS2 patch, or choose another control method (see HANDOFF_REVIEW.md "Blocker").
- The local 1.2.0 work is still UNCOMMITTED in the working tree; commit only when Frank asks.

## Open issues
- Genuine POV/current ESEA/multi-map fidelity not exhaustively tested. Unknown visibility restricts outcome/damage stats. Roles/patterns are heuristics; veto is manual. Utility geometry remains approximate.
- Public release publication was rejected by automatic approval review and remains UNAPPROVED. Do not publish/retry without explicit user approval.
