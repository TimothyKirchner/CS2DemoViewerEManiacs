"use strict";

const {app, BrowserWindow, Menu, protocol, session, shell, dialog, screen} = require("electron");
const path = require("node:path");
const {createResourceHandler} = require("./resources.cjs");

app.setName("Strat Scope");
app.setAppUserModelId("local.stratscope.desktop");

protocol.registerSchemesAsPrivileged([{
  scheme: "stratscope",
  privileges: {standard: true, secure: true, supportFetchAPI: true, corsEnabled: true}
}]);

let mainWindow;
const START_URL = "stratscope://viewer/index.html";

function isInternal(address) {
  try {
    const url = new URL(address);
    return url.protocol === "stratscope:" && url.host === "viewer" && !url.username && !url.password;
  } catch {
    return false;
  }
}

function openSourceLink(address) {
  try {
    const url = new URL(address);
    if (url.protocol === "https:" && url.hostname === "github.com" && !url.username && !url.password) {
      shell.openExternal(url.href).catch(() => {});
    }
  } catch {}
}

function menuAction(action) {
  const controls = {open: "demo-file", export: "export-button", help: "help-button", diagnostics: "diagnostics-button"};
  const id = controls[action];
  if (!id || !mainWindow || mainWindow.isDestroyed()) return;
  // Preserve the real menu click's user gesture for Chromium's file picker.
  // Only these fixed control IDs can be executed, never imported file content.
  mainWindow.webContents.executeJavaScript("document.getElementById(" + JSON.stringify(id) + ")?.click()", true).catch(() => {});
}

function installMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {label: "File", submenu: [
      {label: "Open demo…", accelerator: "CmdOrCtrl+O", click: () => menuAction("open")},
      {label: "Export replay…", accelerator: "CmdOrCtrl+Shift+S", click: () => menuAction("export")},
      {type: "separator"},
      {role: "quit"}
    ]},
    {label: "Edit", submenu: [{role: "undo"}, {role: "redo"}, {type: "separator"}, {role: "cut"}, {role: "copy"}, {role: "paste"}, {role: "selectAll"}]},
    {label: "View", submenu: [{role: "togglefullscreen"}, {role: "resetZoom"}, {role: "zoomIn"}, {role: "zoomOut"}]},
    {label: "Help", submenu: [
      {label: "Viewer help and shortcuts", accelerator: "F1", click: () => menuAction("help")},
      {label: "Import diagnostics…", click: () => menuAction("diagnostics")},
      {label: "About Strat Scope", click: () => dialog.showMessageBox(mainWindow, {
        type: "info", title: "Strat Scope", message: "Strat Scope " + app.getVersion(),
        detail: "Offline CS2 tactical demo viewer.\n\nDemo files are processed on this computer. Smoke and fire footprints are approximations.\n\nIndependent fan tool, not affiliated with Valve. Parser: demoparser2 (MIT)."
      })}
    ]}
  ]));
}

async function createWindow() {
  const area = screen.getPrimaryDisplay().workAreaSize;
  mainWindow = new BrowserWindow({
    title: "Strat Scope",
    width: Math.min(1480, area.width),
    height: Math.min(960, area.height),
    minWidth: Math.min(920, area.width),
    minHeight: Math.min(640, area.height),
    backgroundColor: "#101419",
    icon: path.join(__dirname, "../assets/icon.png"),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      spellcheck: false
    }
  });
  mainWindow.webContents.setWindowOpenHandler(({url}) => {
    openSourceLink(url);
    return {action: "deny"};
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!isInternal(url)) {
      event.preventDefault();
      openSourceLink(url);
    }
  });
  mainWindow.webContents.on("will-attach-webview", event => event.preventDefault());
  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    if (details.reason === "clean-exit") return;
    dialog.showErrorBox("Viewer stopped", "The viewer ran out of resources or stopped unexpectedly. Close and reopen Strat Scope. Very large demos may exceed available memory.\n\n" + details.reason);
  });
  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.on("closed", () => {mainWindow = null;});
  await mainWindow.loadURL(START_URL);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
  app.whenReady().then(async () => {
    protocol.handle("stratscope", createResourceHandler(path.join(app.getAppPath(), "web")));
    session.defaultSession.setPermissionRequestHandler((_contents, permission, callback) => callback(permission === "fullscreen"));
    session.defaultSession.setPermissionCheckHandler((_contents, permission) => permission === "fullscreen");
    session.defaultSession.on("will-download", (_event, item) => {
      const diagnostic = item.getFilename().endsWith(".json");
      item.setSaveDialogOptions({
        title: diagnostic ? "Save import diagnostic report" : "Save Strat Scope replay",
        defaultPath: path.join(app.getPath("downloads"), path.basename(item.getFilename())),
        filters: [diagnostic ? {name: "Diagnostic report", extensions: ["json"]} : {name: "Strat Scope replay", extensions: ["strats"]}, {name: "All files", extensions: ["*"]}]
      });
    });
    installMenu();
    await createWindow();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow().catch(showStartupError);
    });
  }).catch(showStartupError);
  app.on("window-all-closed", () => app.quit());
}

function showStartupError(error) {
  dialog.showErrorBox("Strat Scope could not start", error?.message || String(error));
  app.quit();
}
