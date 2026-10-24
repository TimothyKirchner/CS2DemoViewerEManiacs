"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const {createResourceHandler, resolveResource} = require("../desktop/resources.cjs");
const root = path.resolve(__dirname, "../web");
const handle = createResourceHandler(root);

test("desktop scheme serves the real viewer, worker, modules and WebAssembly with correct MIME types", async () => {
  for (const [name, mime] of [["index.html", "text/html"], ["app.mjs", "text/javascript"], ["core.mjs", "text/javascript"], ["diagnostics.mjs", "text/javascript"], ["diagnostics-ui.mjs", "text/javascript"], ["parse-demo.mjs", "text/javascript"], ["build-info.json", "application/json"], ["parser-worker.js", "text/javascript"], ["vendor/demoparser2_bg.wasm", "application/wasm"]]) {
    const response = await handle(new Request("stratscope://viewer/" + name));
    assert.equal(response.status, 200);
    assert.ok(response.headers.get("content-type").startsWith(mime));
    assert.ok((await response.arrayBuffer()).byteLength > 0);
    assert.ok(response.headers.get("content-security-policy").includes("'wasm-unsafe-eval'"));
  }
});

test("desktop resource handler rejects files outside the viewer and foreign hosts", async () => {
  for (const url of ["stratscope://viewer/%2f..%2fpackage.json", "stratscope://viewer/%5c..%5cpackage.json", "stratscope://other/index.html", "file:///etc/passwd", "stratscope://viewer/%00"]) {
    assert.throws(() => resolveResource(root, url));
  }
  assert.equal((await handle(new Request("stratscope://viewer/not-found.txt"))).status, 404);
  assert.equal((await handle(new Request("stratscope://viewer/index.html", {method: "POST"}))).status, 405);
});

test("all packaged map definitions resolve to real PNGs", async () => {
  const response = await handle(new Request("stratscope://viewer/maps/maps.json"));
  const maps = await response.json();
  assert.equal(Object.keys(maps).length, 10);
  for (const map of Object.values(maps)) {
    for (const name of [map.image, map.lower].filter(Boolean)) {
      const image = await handle(new Request(new URL(name, "stratscope://viewer/")));
      assert.equal(image.status, 200);
      const bytes = new Uint8Array(await image.arrayBuffer());
      assert.deepEqual([...bytes.slice(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    }
  }
});
