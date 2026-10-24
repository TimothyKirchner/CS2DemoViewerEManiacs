import {createReport, finishReport, failReport} from "./diagnostics.mjs";

const $ = id => document.getElementById(id);
const storageKey = "stratscope-last-import-report";
const build = fetch("./build-info.json").then(r => r.ok ? r.json() : {}).catch(() => ({}));
let latest = null;
try {
  const stored = JSON.parse(localStorage.getItem(storageKey) || "null");
  if (stored?.reportVersion === 1 && Array.isArray(stored.steps)) {
    latest = stored;
    if (latest.status === "running") finishReport(latest, "interrupted");
  }
} catch {}

function render() {
  const report = latest;
  $("diagnostic-title").textContent = report?.status === "failed" ? "Could not open this file" : "Import diagnostics";
  $("diagnostic-summary").textContent = !report ? "Open a demo to create a report. The most recent import report is kept on this device." : report.status === "failed" ? `${report.stage}: ${report.error?.message || "Unknown error"}` : `${report.file.name} — ${report.status}${report.warnings.length ? " (with warnings)" : ""}`;
  $("diagnostic-hint").hidden = !report?.error || !/entity not found/i.test(report.error.message);
  $("diagnostic-report").value = report ? JSON.stringify(report, null, 2) : "No import report yet.";
  $("copy-diagnostics").disabled = $("save-diagnostics").disabled = !report;
}

export function saveDiagnostics(report) {
  latest = report;
  try { localStorage.setItem(storageKey, JSON.stringify(report)); } catch {}
  if ($("diagnostics-dialog").open) render();
}

export async function startDiagnostics(file) {
  const environment = {
    userAgent: navigator.userAgent, platform: navigator.platform, language: navigator.language,
    hardwareConcurrency: navigator.hardwareConcurrency, deviceMemoryGB: navigator.deviceMemory ?? null,
    crossOriginIsolated: globalThis.crossOriginIsolated
  };
  const report = createReport(file, await build, environment);
  return report;
}

export function cancelDiagnostics() {
  if (latest?.status === "running") saveDiagnostics(finishReport(latest, "cancelled"));
}

export function showDiagnostics() {
  render();
  $("diagnostic-status").textContent = "";
  $("help-dialog").close();
  if (!$("diagnostics-dialog").open) $("diagnostics-dialog").showModal();
}

export function showImportFailure(report, error) {
  saveDiagnostics(failReport(report, error));
  showDiagnostics();
}

$("close-diagnostics").onclick = () => $("diagnostics-dialog").close();
$("copy-diagnostics").onclick = async () => {
  if (!latest) return;
  const area = $("diagnostic-report");
  try {
    // Works with the desktop's permission policy; no clipboard-read access.
    area.focus(); area.select();
    if (!document.execCommand("copy")) await navigator.clipboard.writeText(area.value);
    $("diagnostic-status").textContent = "Report copied.";
  } catch {
    $("diagnostic-status").textContent = "Press Ctrl+C to copy the selected report, or use Save report.";
  }
};
$("save-diagnostics").onclick = () => {
  if (!latest) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(latest, null, 2)], {type: "application/json"}));
  const a = document.createElement("a");
  a.href = url;
  a.download = "Strat-Scope-diagnostic-" + latest.startedAt.replace(/[:.]/g, "-") + ".json";
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  $("diagnostic-status").textContent = "Report ready to save. Nothing is sent automatically.";
};
