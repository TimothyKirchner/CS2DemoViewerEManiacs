# 3D automated review

Open `web/review/index.html` (the "3D Review" link in the viewer). It loads a `.dem` (parsed in a worker),
a `.strats` replay (coarse review only) or a saved `.scopereview` (gzip JSON of the replay plus review detail).
Everything runs locally.

## Pipeline

1. `../parse-demo.mjs` builds the normal replay.
2. `parse-review.mjs` runs a second pass: every `player_hurt` and `weapon_fire` with pitch and velocity, and
   dense samples (every 2 ticks, from 3 s before to 0.25 s after each hit or kill) with approximate spotting,
   ducking and scoping.
3. `engine/review.mjs` (`reviewReplay(replay, {detail})`) runs:
   - `win-probability.mjs`: heuristic round win probability per tick (alive players, equipment, bomb, time).
   - `mechanics.mjs`: duels; crosshair angle when the enemy becomes spotted, spot-to-shot reaction,
     spot-to-damage time, speed at each shot (counter-strafing), accuracy and headshot rate.
   - `decisions.mjs`: dry opening, isolated death, missed trade (line-of-sight aware), re-peek while damaged,
     exposure to several enemies, unused utility, no save, team flash; highlights for trades, flash assists,
     multikills, clutches and clean duels.
   - `rating.mjs`: HLTV 1.0 (exact), HLTV 2.0 (community approximation), WPA impact per round, mechanics and
     decision scores, and the composite Scope Rating.
   - `clips.mjs`: groups findings per player and round into clips with tips; the top clips are "featured".
4. `engine/clip-plan.mjs` turns clips into a recording plan (ticks, spectator account ID, SRT critiques).
   The "Export clips" button saves the plan for the listed clips; `recorder/record-clips.mjs` records it.

## Viewer

Orbit, POV, chase and top cameras; spotting lines, tracers, utility, a win-probability timeline and a pause on
each critique. `[`/`]` jump between critiques, Space plays and pauses.

## Limits

- Spotting is the game's `spotted` state, which lags real visibility. Crosshair and reaction values are
  therefore optimistic. Benchmarks are in `mechanics.mjs` (`BENCHMARKS`).
- Win-probability coefficients are hand-set, not fitted. WPA-based impact inherits that error.
- HLTV 2.0 is an approximation of an unpublished formula.
- "Isolated" fires often on CT anchors that hold alone by design; it is rated low severity.
- `.strats` replays lack damage, pitch and spotting, so mechanics and most decisions are skipped.
- POV demos, missing ticks and partial recordings reduce coverage; the header shows what was available.

Third-party: three.js 0.169.0 (MIT), vendored at `web/vendor/three.module.min.js`.
