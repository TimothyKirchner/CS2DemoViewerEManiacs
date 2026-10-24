"use strict";

// No Node, IPC or filesystem API is exposed to the viewer.
window.addEventListener("DOMContentLoaded", () => {
  document.title = "Strat Scope — Offline CS2 Demo Viewer";
  const badge = document.querySelector(".local-badge");
  if (badge) badge.textContent = "OFFLINE DESKTOP";
});
