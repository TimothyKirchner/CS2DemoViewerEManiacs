self.onmessage = async ({data}) => {
  const report = data.report;
  let failReport;
  try {
    const diagnostics = await import("./diagnostics.mjs");
    failReport = diagnostics.failReport;
    diagnostics.beginStep(report, "Loading demo parser", "initializeWasm");
    postMessage({type: "progress", stage: report.stage, pct: 5, report});
    importScripts("./vendor/demoparser2.js");
    await wasm_bindgen({module_or_path: new URL("./vendor/demoparser2_bg.wasm", self.location.href)});
    const {parseDemo} = await import("./parse-demo.mjs");
    const replay = await parseDemo(new Uint8Array(data.buffer), data.name, wasm_bindgen, report, message => postMessage(message));
    diagnostics.finishReport(report);
    postMessage({type: "done", replay, report});
  } catch (error) {
    // Module-loading failures still reach the UI even if diagnostics cannot load.
    if (failReport) failReport(report, error);
    postMessage({type: "error", message: error?.message ?? String(error), report: failReport ? report : null});
  }
};
