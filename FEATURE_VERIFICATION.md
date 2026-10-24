# Scouting feature verification

Implemented release requirements:

- Shooting: recorded weapon-fire events rendered briefly at the shooter; seeking behaves deterministically.
- Flashbangs: subtle, optional approximate reach overlay; distinguish reach from actual blindness and disclose obstruction limitations.
- Loadouts: map icons for the best carried weapon, armor amount/helmet and grenades/counts. Each category toggles independently. The sidebar retains the full recorded inventory. Cards avoid collisions.
- Heatmaps: separate T/orange and CT/blue maps for a whole round, with stronger first-30-second weighting and declining later weight; exclude freeze time and dead players.
- Round economy: per-team pistol/full-buy/eco/force labels with credible cited definitions and explicit heuristic thresholds; preserve missing-data uncertainty.
- Representative rounds: compare full-buy rounds and force rounds separately for each team/side; select an actual round closest to the average and play it via a button.
- Special rounds: explain and play detected site stacks and 4/5-player pushes; identify heuristic candidates without claiming tactical intent.
- Regression: existing playback, pistol sequence, seeking, focus, utility, notes, import/export and diagnostics remain functional.
- Delivery: updated complete source archive and Windows portable executable; package metadata and parser fingerprints checked.
- Verification: automated checks plus rendered viewer checks; native Windows launch reported separately from browser validation.

The original 1.0.2 baseline passed all 22 tests before edits. Original archive and executable remain in the parent workspace.

Validation on Windows: all 41 automated tests pass. The pinned public Mirage
demo yields nine rounds, ten players, 147 utility effects, 150 grenade paths,
and 1,482 firing events. Recorded shot coordinates/yaw, helmets and defuse kits
are checked. The bundled sample was regenerated with this data.

Electron smoke checks sample loading, visible round buttons, ten loadouts,
both heatmap toggles, representative navigation/playback, real demo import via
the worker, no renderer errors and loadout access at 920px desktop width.
The native Windows development application was launched and its sample loaded
through the interface. Source/package byte equality is checked separately by
scripts/verify-package.cjs; verification/package-manifest.json records hashes.

Limits: classifications and formations are heuristics, not proof of intent.
Flash reach is a reference circle without wall/visibility simulation. Site
stack detection needs anchors and floor metadata; unavailable maps warn.
Only the public Mirage raw demo was available, not a current ESEA match.
See ANALYSIS.md for cited definitions and exact methodology.
