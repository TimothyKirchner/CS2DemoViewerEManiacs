# Strat Scope

A browser-local CS2 2D demo viewer for reviewing opponents' setups and utility.

## Use

Open the hosted viewer on a desktop browser and choose **Open demo**. Select an extracted CS2 `.dem` file; compressed `.zip`, `.bz2`, and `.zst` downloads must be extracted first. Nothing in the application uploads the selected demo. The parser runs in a Web Worker using bundled WebAssembly.

The built-in **Explore a real sample match** opens a public nine-round Mirage fixture. It contains only the first half, so only one pistol round is available in that sample.

## Included

- Calibrated radar images for Mirage, Inferno, Dust2, Ancient, Anubis, Nuke, Overpass, Train, Vertigo and Cache; floor selectors where separate radar images are bundled.
- Player positions, names, facing arrows, health, held weapons, money and armor.
- Grenade flight paths, smoke and fire overlays with remaining lifetime, flash/HE bursts, kill and bomb events.
- Round selection, previous/next round, timeline seeking, five-second jumps, freeze-time skipping and round looping.
- 0.5×, 1×, 2×, 4×, 8× and 16× speeds.
- **Pistol strats** plays round 1 and the detected regulation side-switch round (13 or legacy 16), then stops. It does not select overtime rounds.
- Team focus follows player identities across halftime; individual player highlighting, zoom/pan and fullscreen.
- Timestamped browser-local notes; export/import compressed `.strats` replays with notes and custom radar calibration.

## Accuracy and limits

Player and grenade positions and available utility start/expiry events come from the demo. Positions are sampled every four ticks and interpolated. Smoke and fire footprints are approximate circles; the viewer does not reproduce exact wall clipping, flame cells, or temporary smoke holes. Missing expiry events use marked fallback lifetimes. A round's display ends at its recorded round-end event.

Bundled radar images may differ from historical or future map revisions. Help allows a custom radar image and its overview `pos_x`, `pos_y`, and `scale` values. An unsupported map is explicitly reported.

Use complete CS2 match/GOTV recordings. CS:GO demos are not supported. New game updates may require a parser update. Browser memory can limit large demos; the 1.5 GB input guard is not a guarantee that every smaller recording will fit in memory. No multi-match library or automated strategy classification is included.

## Development

There is no build step or package installation. Serve `web/` over HTTP, for example with Python's standard library:

    python -m http.server 8080 --directory dist

Open `http://localhost:8080/`. Run timeline and utility regression checks with:

    node --test tests/core.test.mjs

An optional integration check parses the public demoparser Mirage fixture and refreshes `web/sample.strats`:

    node tests/real-demo.mjs /absolute/path/to/test_demo.dem

## Verification recorded 2026-10-22

Eight regression tests passed, covering pistol selection and stopping, MR15, partial recordings, warmup/restarts, utility expiry/backwards seeking, radar coordinates, angle interpolation, and linking Molotov flights to separate fire entities. The bundled parser processed a 58 MB actual CS2 demo: 9 rounds, 10 players, 126,700 player samples, 150 grenade paths and 147 effects.

The sample loaded in the browser and round navigation and the utility list were inspected. Browser automation subsequently stalled during raw file selection and became unavailable; the complete browser file-picker-to-playback path and a full two-half real demo remain unverified. Halftime behavior is covered by synthetic regression fixtures.

## Sources

Parser: [LaihoE/demoparser](https://github.com/LaihoE/demoparser), MIT license included in `web/vendor/demoparser-LICENSE.txt`. Public sample: its `src/parser/test_demo.dem` fixture. Radar assets: Valve, distributed through [MurkyYT/cs2-map-icons](https://github.com/MurkyYT/cs2-map-icons). Exact source revisions are recorded in `web/vendor/sources.json`; original overview metadata is retained beside the radars. Independent fan project, not affiliated with Valve.
