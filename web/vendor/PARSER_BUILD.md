# Strat Scope 1.0.2 parser

Compiled from demoparser revision `45ca85aeac8fb0de9d385124d2c7fe0e7b8ff0c8`
with Rust 1.99.1 and wasm-bindgen 0.2.100. Exact hashes are recorded in
`web/build-info.json` and checked by tests.

The previously bundled upstream WASM binary predated current parser fixes.
The supplied protocol-14191 Dust2 demo reproduced `EntityNotFound` with it.

The included `patches/wasm-compatibility.patch`:

- Uses committed protobuf code instead of downloading an unpinned game schema.
- Excludes native profiling clocks, which panic on wasm32.
- Enables projectile collection in the WASM grenade entry point and routes
  optional grenade properties as the native binding does. The upstream WASM
  entry point incorrectly selected player collection.

The viewer requests projectile-only rows and accepts `grenade_entity_id`
while retaining legacy `entity_id` support. No demo decoding rules changed.

To rebuild on Linux x64 with Python 3.12+, patch, and rustup installed:

```sh
rustup toolchain install 1.99.1 --profile minimal
rustup target add wasm32-unknown-unknown --toolchain 1.99.1
python3 scripts/rebuild-parser.py
npm test
node tests/real-demo.mjs /path/to/upstream/test_demo.dem
node tests/compatibility-demo.mjs /path/to/recent/match.dem de_dust2
npm run build:win
```

The script verifies pinned downloads and builds with Cargo's committed
lockfile. The EXE includes the compiled parser; end users need neither Rust
nor Python. Private regression demos are not included in the source archive.
