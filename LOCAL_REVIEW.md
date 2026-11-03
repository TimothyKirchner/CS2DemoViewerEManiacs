# Local review sessions

Select multiple `.dem` or `.strats` files with **Import demos**, or drop them into the viewer. Files are processed sequentially. A failed file does not prevent the rest of the queue from loading; Cancel stops pending imports. Duplicates are skipped. **Review session → Matches** switches or removes matches and edits team names and dates. There is no persistent match database. Export a `.stratsession` before closing to retain the session.

Team 1 and Team 2 refer to the tracked rosters that started T and CT, respectively. Leave unknown names blank. Enter the same name across matches only for the same actual team. Dates are user supplied when the recording does not provide usable dates.

## Find rounds and review them

**Round search** combines map, team, player, side, opening buy, result and date filters. Play the matching rounds or open an individual result. Statistics and scouting inherit these round filters. Buy categories use the existing equipment heuristics; they are not purchase-history labels.

**Playlist** saves a bookmark from the current tick to round end, or a clip with start/end markers within one round. Add titles, tags and coach notes, edit or reorder clips, then play them across matches. Export session carries replay data, match metadata, replay notes and playlist entries for offline sharing. Reimported voice attachments retain settings, but require choosing the original audio file again.

Use **Copy position** after selecting a player. Where recorded pitch is available, the command includes position and view angles; older recordings identify missing pitch. Comma/period jump to previous/next recorded kill; C opens clips. Normal player/round controls remain available.

## Statistics

Ranks compare only the imported players and selected rounds. Kills, deaths, assists and opening contacts are event counts. Trades use a configurable interval (default five seconds); killing a recent teammate's killer earns a trade kill. One kill may trade multiple deaths. KAST is the share of eligible player-rounds with a kill, assist, survival or traded death.

ADR uses enemy health damage, capped to remaining victim health, divided by covered rounds. Armor damage, friendly fire and self damage do not count. HE and fire damage use the same event coverage. A successful parse explicitly records `player_hurt` coverage; older exports cannot establish this merely by containing some damage fields. Team ADR is total selected-player damage per team round, not the average player's ADR. Team KAST uses player-rounds.

Outcome metrics require complete broadcast rounds with a fresh full roster and end snapshot. Missing or unverified coverage shows unavailable values instead of invented zeroes. Metric denominators can therefore differ from observed round counts. Clutches are observed 1vX attempts and wins. Flash impact counts recorded blindness events; summed blind time can overlap. Post-round events are retained separately but excluded from the live-round metrics.

## Cross-match scouting

Select a map, team/side, time window and floor. Occupancy heatmaps sum living player seconds with gaps capped at half a second. Drag a rectangle on the radar, or enter world-coordinate bounds, to find matching rounds and replay evidence. Coordinates from different maps are never combined.

Recurring patterns compare coarse 512-unit cells: opening occupancy, three chronological position samples, or ordered utility type/landing cells and five-second time bins. At least two matching observations are needed. These are review candidates; movement shifts can split similar tactics. Role profiles describe observed AWP equipment, opening contact and positional consistency, with sample counts and limited confidence. They do not infer a player's assigned team role.

Map results describe observed round outcomes. The veto tool lets you enter a pool, choose acting teams and apply or undo bans/picks; it makes no prediction. Add coach notes and tactic tags, then export a preparation report as HTML or Markdown. Reports contain match/round/tick references; keep the accompanying session bundle to revisit them.

## Opponent analyser

Open **Review → Analyse opponent** and import several demos of the team you will play.

- **Roster.** Players are matched by SteamID, never by name; the latest name is shown. A player in at least half of the included demos is core, everyone else is a stand-in ("stand-in, 1 of 4 demos"). A demo belongs to the team when at least 3 of its players are core. Override any player (core / stand-in) or exclude a demo; overrides are saved in the session.
- **Buy-type round library.** Rounds per map and side grouped as pistol, eco, force, half, full, anti-eco and post-plant save, each with sample size, win rate, typical route, first contact time, utility per round and a representative round.
- **Positions and setups.** CT setups and T spreads (A / mid / B at 15 s CT, 20 s T), usual spots of core players, AWP positions and rotations, filterable by buy type and score; heatmaps per time window and player.
- **Tendencies.** Opening duels by callout and player, trades within 5 s, stacks and retakes, utility landing clusters with timing, economy habits after pistol and buy rounds, clutches and likely timeouts.
- **Anti-strat report.** "Build report" shows a per-map "how to beat them" page: exploitable habits with sample sizes ("BombsiteA anchored by X: 82% (18 of 22 rounds)"), a counter idea per habit, ▶ evidence rounds that open the viewer, stand-in notes and a map veto suggestion (ban their strongest map, pick their weakest; maps without demos stay unknown). "Export Markdown" / "Export HTML" save it with round references (round, demo file, tick); the Cross-match scouting prep report includes the same page.

Team-level numbers use every matched round, stand-ins included; named player habits use core players only, and a stand-in on an absent core player's spot is labelled "filled by stand-in". Every pattern, counter idea and veto suggestion is a heuristic from the imported demos, not a prediction: fewer than 10 rounds are marked "small sample". Zones use the bombsite callouts and calibrated site anchors (1400 units), so some mid callouts can count as a site.

From the command line (no UI, no CS2): `node scripts/opponent-report.mjs <demo|folder>... --md out.md --html out.html` writes the same report; keep it out of Git, it contains player names.

## Voice and recording limits

Attach an audio file in Matches. Offset is the demo time in seconds at which audio begins: audio time = demo tick / tick rate − offset. Positive offset delays audio. Pause, seek and supported playback speeds follow the replay; volume is per match. Audio is not extracted from the demo or sent anywhere.

The parser can only display what a demo contains. POV or incomplete recordings may omit opponents, positions or events, so complete-broadcast analysis is disabled when coverage is unverified. Multi-map/current-ESEA/POV fidelity still depends on real recording validation. Utility areas remain approximate and do not model smoke holes, wall clipping or exact flame spread. This release provides local analysis workflows, not an assertion of identical Skybox algorithms or online data coverage.
