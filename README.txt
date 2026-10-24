STRAT SCOPE 1.1.1 — WINDOWS x64

GET STARTED
1. Double-click Strat-Scope-1.1.1-Windows-x64.exe.
2. Click Open demo (or use Ctrl+O) and choose an extracted CS2 .dem file.
3. Choose a round or click Pistol strats, then use the playback controls.

This is a portable application: it does not need installation, administrator
rights, Python, Node.js, a separately installed browser, or a paid API.
It includes its own runtime, maps, parser and nine-round Mirage sample.
It extracts its runtime to a temporary directory when launched. Leave time
for this on the first launch. Notes and preferences are stored in your
Windows user profile, not next to the EXE. Export a .strats replay to keep
notes with a match or move them to another PC.

The viewer works offline. Selected demos are not uploaded. Only deliberately
opening a source-credit link launches an external website in your browser.

FEATURES
- Recorded shooting direction flashes and optional approximate flashbang reach.
- Map icons show the best carried weapon, armor amount/helmet and grenades.
  Weapon, armor and grenade layers each have an independent toggle.
- Full recorded inventory remains available in the sidebar.
- Per-side orange T / blue CT heatmaps for the entire round. First 30 seconds
  count twice; later influence halves every 30 seconds.
- Per-team opening buy labels: pistol, full buy, eco, force, mixed or unknown.
- Representative full-buy and force rounds, calculated separately per team
  and side, with direct playback. Special formation candidates are playable.
- Economy definitions and transparent heuristics are documented in ANALYSIS.md.
- Named players and facing directions on calibrated radar maps.
- Grenade flight paths and smoke/fire effect countdowns.
- Round selection, previous/next round, pause, seeking and round loop.
- Speeds: 0.5x, 1x, 2x, 4x, 8x, 16x.
- Pistol strats: round 1 followed by the detected second-half regulation
  pistol (R13, or legacy R16), then stop. Overtime is not included.
- Team focus across halftime, player highlighting, zoom and pan.
- Kill/bomb events, timestamped notes, replay export/import, custom radar.

SHORTCUTS
Ctrl+O          Open demo
Ctrl+Shift+S    Export replay
Space           Play/pause
Left/Right      Seek five seconds
[ / ]           Previous/next round
P               Pistol strats
L               Loop current round
Home            Restart round
F11             Fullscreen window
F1              Help

IMPORT DIAGNOSTICS
If a file fails to open, a persistent diagnostic window appears. Use Copy
report or Save report (.json), then share the report when asking for help.
Reopen it using Diagnostics in the toolbar or Help > Import diagnostics.
The most recent import report is kept on this device across app restarts.

Reports contain the filename/size, app and parser versions, environment,
parsing steps and timings, selected header metadata, counts, warnings and
available error messages/stacks. They do not attach demo contents or player
rosters and are never sent automatically. Review the report before sharing.
A parser that throws only a string cannot supply an entity ID or stack that
it did not return. This update adds diagnostics; it does not claim to fix
the underlying "Entity not found" parser failure.

KNOWN LIMITS
- Smoke/fire footprint shapes are approximate, not exact smoke volumes or
  flame spread. Available start/expiry events are read from the demo; a ~
  marks estimated lifetimes when events are missing.
- Old or future map versions can require a matching custom radar in Help.
- The bundled public sample contains only nine rounds and one pistol.
- Extract .zip/.bz2/.zst downloads first. CS:GO demos are not supported.
- Very large demos can exceed memory. This package retains the existing
  viewer's 1.5 GB input guard; smaller files can still exceed available RAM.
- Game updates may require a new parser build.

BUILD AND VERIFICATION
This is an unsigned Windows x64 executable. Windows may show
an unknown-publisher/SmartScreen warning. No signing certificate is bundled.
See FEATURE_VERIFICATION.md for this release's verification record.
Automated tests cover the desktop asset handler, map assets, replay logic,
failed parsing stages, error details and nonfatal parser warnings. The viewer's parser was verified using a real 58 MB CS2 demo.

SOURCE BUILD (ONLY FOR DEVELOPMENT)
Install a supported Node.js LTS version and run these commands in the source
folder containing package.json:
    npm ci
    npm test
    npm run build:win
The portable executable is written to release/.
To run the development desktop app:
    npm start

DEPENDENCIES AND CREDITS
Electron 45.0.0, electron-builder 26.15.3. Exact dependencies are locked in
package-lock.json. Runtime license notices ship inside the portable package.
See THIRD_PARTY_NOTICES.txt for parser and map sources.

VERSION 1.1.1
Adds offline opponent scouting, heatmaps, equipment and shot visualization.
Classification and special formations are review aids, not proof of intent.
Flash reach is approximate and does not simulate walls or line of sight.

PARSER BASELINE 1.0.2
Rebuilt the parser from pinned source to fix EntityNotFound on the supplied
Dust2 demo. Corrected WASM projectile collection and grenade ID handling.
Parser rebuild instructions: web/vendor/PARSER_BUILD.md.
