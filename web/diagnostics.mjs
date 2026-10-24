// Small, JSON-safe import reports. Never attach demo bytes or player records.
const clipped = (value, limit = 12000) => {
  const text = String(value);
  return text.length > limit ? text.slice(0, limit) + `… [truncated after ${limit} characters]` : text;
};

export function errorDetails(error, seen = new Set()) {
  if (error === null || typeof error !== "object") return {name: "ThrownValue", message: clipped(error), stack: null};
  if (seen.has(error)) return {name: "CircularCause", message: "[Circular cause]", stack: null};
  seen.add(error);
  const result = {
    name: clipped(error.name || error.constructor?.name || "Error", 200),
    message: clipped(error.message ?? String(error)),
    stack: typeof error.stack === "string" ? clipped(error.stack, 24000) : null
  };
  for (const key of ["code", "errno"]) {
    if (["string", "number", "boolean"].includes(typeof error[key])) result[key] = clipped(error[key], 200);
  }
  if (error.cause !== undefined && seen.size < 5) result.cause = errorDetails(error.cause, seen);
  return result;
}

export function createReport(file, build = {}, environment = {}) {
  return {
    reportVersion: 1,
    startedAt: new Date().toISOString(),
    status: "running",
    app: build.app ?? {name: "Strat Scope", version: "unavailable"},
    parser: build.parser ?? {name: "demoparser2", revision: "unavailable"},
    environment,
    file: {
      name: String(file.name).split(/[\\/]/).at(-1),
      sizeBytes: file.size,
      lastModified: Number.isFinite(file.lastModified) ? new Date(file.lastModified).toISOString() : null
    },
    stage: null, operation: null, steps: [], context: {}, warnings: [], error: null,
    privacy: "Contains the filename, technical metadata and error text. No demo bytes, player roster or full input path are attached. Nothing is uploaded automatically."
  };
}

function closeStep(report, status) {
  const step = report.steps.at(-1);
  if (step?.status === "running") {
    step.status = status;
    step.durationMs = Math.max(0, Date.now() - Date.parse(step.startedAt));
  }
}

export function beginStep(report, stage, operation) {
  closeStep(report, "completed");
  report.stage = stage;
  report.operation = operation;
  report.steps.push({stage, operation, status: "running", startedAt: new Date().toISOString()});
}

export function finishReport(report, status = "completed") {
  closeStep(report, status);
  report.status = status;
  report.finishedAt = new Date().toISOString();
  report.durationMs = Math.max(0, Date.parse(report.finishedAt) - Date.parse(report.startedAt));
  return report;
}

export function failReport(report, error) {
  report.error = errorDetails(error);
  return finishReport(report, "failed");
}

export function warnReport(report, error, message) {
  closeStep(report, "warning");
  report.warnings.push({stage: report.stage, operation: report.operation, message, error: errorDetails(error)});
}

export function headerDetails(header) {
  // Server/client names and arbitrary header strings are deliberately excluded.
  const result = {};
  for (const key of ["map_name", "demo_version_name", "demo_version_guid", "demo_file_stamp", "network_protocol", "demo_protocol", "demo_version", "build_num", "game", "game_directory", "fullpackets_version", "allow_clientside_entities", "allow_clientside_particles"]) {
    if (["string", "number", "boolean"].includes(typeof header[key])) result[key] = typeof header[key] === "string" ? clipped(header[key], 300) : header[key];
  }
  return result;
}
