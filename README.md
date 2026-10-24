# Strat Scope

Offline CS2 demo viewer for opponent scouting, built with Electron. Demos are processed locally.

## Features

- Calibrated tactical maps, player positions, facing and recorded shooting.
- Independently toggleable map icons for the best carried weapon, armor and grenades; full inventory in the sidebar.
- Grenade paths, smoke/fire timers, optional approximate flash reach and recorded blindness.
- Orange T and blue CT round heatmaps, emphasizing the first 30 seconds and reducing later influence.
- Per-team pistol/full-buy/eco/force labels and representative full-buy/force playback.
- Special-round candidates for site stacks and grouped pushes.
- Seeking, playback speeds, looping, team focus across halftime, notes, replay import/export and local diagnostics.

## Run and build

Install Node.js and run from this directory:

```sh
npm ci
npm test
npm start
npm run build:win
```

The unsigned Windows portable executable is written to `release/`. It includes its runtime, maps and parser; end users need no Node.js installation.

## Documentation

- [User guide](README.txt)
- [Analysis definitions, cited sources and limitations](ANALYSIS.md)
- [Verification record](FEATURE_VERIFICATION.md)
- [Parser build and compatibility patch](web/vendor/PARSER_BUILD.md)
- [Third-party notices](THIRD_PARTY_NOTICES.txt)

Buy and formation labels are scouting heuristics. Flash reach and utility footprints are approximate, not wall/visibility simulations. Missing map metadata can limit formation detection.

The bundled public Mirage sample is credited in the third-party notices. Private match demos, local profiles, dependencies and generated executables are excluded from source control. Independent fan project; not affiliated with Valve.
