# Local analysis expansion — 1.2.0

User scope: import several demos into one session, without a managed match database or cloud services. Add local equivalents for the remaining scouting/review workflows. Analysis of imported recordings is not a claim of identical Skybox algorithms or global data coverage.

Implemented scope (69 unit tests, real-demo and Electron workflow checks pass; 55 packaged application files verified):

- Multiple-demo import queue; switching/removing matches; progress, cancellation and per-file errors.
- Match/team/date metadata and combined round filters across the imported session.
- Bookmarks, timed clips, ordered playlists and cross-match playback.
- Local session import/export carrying notes, tags and playlists for file-based team sharing.
- Player/team/map/weapon statistics with documented definitions and missing-data handling.
- Damage events and source coverage, incomplete/POV recording caveats.
- Cross-match heatmaps, area/time queries and recurring opening/utility candidates with evidence.
- Evidence-based role profiles, map results and user-controlled veto scenarios.
- Exportable opponent preparation report.
- Per-match local audio attachment, offset, volume and transport synchronization.
- Position copying and event navigation shortcuts.
- Regression tests, real-demo parsing, desktop workflow checks, visual review and verified local packaging.

No online accounts, public-demo acquisition service, hosted leaderboards or live team synchronization. Leaderboards compare only imported players; shared work travels in exported files. Audio recordings must be supplied by the user.
