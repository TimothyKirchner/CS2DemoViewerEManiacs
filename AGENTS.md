# cs2-demo (Strat Scope)

Global rules: `C:\Users\timot\Desktop\AIOverseer\AGENTS.md`. Read `HANDOFF.md` first.

## Project
- Strat Scope: offline Electron CS2 demo viewer with scouting, stats and prep reports (see README.md,
  VIEWER.md, LOCAL_REVIEW.md, LOCAL_ANALYSIS_PLAN.md). This folder is the repository; the parent
  `C:\Users\timot\Desktop\CS2DemoviewerEmaniacs` holds release artifacts, `public-test.dem` and old handoffs.
- Planned: a 3D automated demo review tool reusing the parser (will live in its own folder here).

## Workspace and preferences
- Start replies with "Frank,"; keep output/context short. Token efficiency outranks speed.
- Use RTK for EVERY shell command (Codex), including subagents. Read C:\Users\timot\.codex\RTK.md via rtk read; use rtk proxy for unsupported commands.
- Workspace changes are preapproved.

## Commands (from this repository; prefix with `rtk proxy` in Codex)
- Unit tests: `node --test --test-reporter=dot tests/*.test.mjs tests/*.test.cjs`
- Session smoke: `.\node_modules\electron\dist\electron.exe tests\session-smoke.cjs`
- Viewer smoke: `.\node_modules\electron\dist\electron.exe tests\viewer-smoke.cjs --demo ..\public-test.dem`
- Real-demo stats: `node tests/statistics-real-demo.mjs ../public-test.dem`
- Real-demo review: `node tests/review-real-demo.mjs ../public-test.dem --write ../public-test.scopereview`
- Clip recorder: `node recorder/record-clips.mjs --review ../public-test.scopereview --top 2 --dry-run`
  (drop `--dry-run` to start CS2; ask Frank first). Setup in recorder/README.md.
- Instructive rounds (focus player, clip timestamps, no CS2): `node scripts/instructive-rounds.mjs <demo|folder>...`
  (.dem/.dem.zst/.dem.gz; output in Git-ignored review-out/, see recorder/README.md).
- `node` is not on PATH here; use C:\Users\timot\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe.
- Package check: `node scripts/verify-package.cjs`
- Local build: `node .smoke-profile/build-local.cjs` (existing local build helper; publish never)
- Python packager: scripts/package-source.py. Bundled Python: C:\Users\timot\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe
- GUI/network build commands may require escalation. Global npm/gh absent; local npm is ../package/bin/npm-cli.js.

## Rules
- Preserve patched WASM/parser fingerprints. Do not commit public-test.dem or profiles/dependencies.
- Never read `*.dem`, `node_modules/`, `release/`, `.smoke-profile/` or `verification/portable/`.
- Never publish a GitHub release or run the parent's `.github-release.cjs` without explicit user approval.
- Never print credentials. Pushes use the local Git Credential Manager login (TimothyKirchner).
- Keep this file under ~150 lines. Decisions go in `DECISIONS.md`, progress in `HANDOFF.md`.
