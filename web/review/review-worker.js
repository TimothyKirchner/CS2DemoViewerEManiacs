// Parses a demo for the automated review: viewer replay + review detail pass.
self.onmessage = async ({data}) => {
  const report = data.report;
  let failReport;
  try {
    const diagnostics = await import("../diagnostics.mjs");
    failReport = diagnostics.failReport;
    diagnostics.beginStep(report, "Loading demo parser", "initializeWasm");
    postMessage({type: "progress", stage: report.stage, pct: 3, report});
    importScripts("../vendor/demoparser2.js");
    await wasm_bindgen({module_or_path: new URL("../vendor/demoparser2_bg.wasm", self.location.href)});
    const {parseDemo} = await import("../parse-demo.mjs");
    const {parseReviewDetail} = await import("./parse-review.mjs");
    const bytes = new Uint8Array(data.buffer);
    const replay = await parseDemo(bytes, data.name, wasm_bindgen, report, m => postMessage({...m, pct: Math.round(m.pct * 0.7)}));
    diagnostics.beginStep(report, "Reading fights for the review", "parseReviewDetail");
    const detail = parseReviewDetail(bytes, wasm_bindgen, replay, m => postMessage({type: "progress", stage: m.stage, pct: 70 + Math.round(m.pct * 0.25), report}));
    diagnostics.finishReport(report);
    postMessage({type: "done", replay, detail, report});
  } catch (error) {
    if (failReport) failReport(report, error);
    postMessage({type: "error", message: error?.message ?? String(error), report: failReport ? report : null});
  }
};
