/**
 * Preload só para teste local (`npm run start:update-ui` → main usa `--update-ui-dev`).
 * Não está em `package.json` → build.files — não entra no instalador.
 */
const { contextBridge, ipcRenderer } = require("electron");
const createUpdaterBar = require("./preload-updater-ui.js");

const previewStepMs = (() => {
  const a = process.argv.find((x) => x.startsWith("--crm-dev-update-step-ms="));
  if (!a) return 140;
  const n = parseInt(a.slice("--crm-dev-update-step-ms=".length), 10);
  return Number.isFinite(n) ? Math.max(0, n) : 140;
})();

contextBridge.exposeInMainWorld("appInfo", {
  platform: process.platform,
  node: process.versions.node,
  chrome: process.versions.chrome,
  electron: process.versions.electron
});

function startPreviewDownload(ui, version) {
  ui.applyDownloadProgress(0);
  let pct = 0;
  const step = () => {
    pct = Math.min(100, pct + 10);
    ui.applyDownloadProgress(pct);
    if (pct >= 100) {
      ui.applyUpdateDownloaded(version);
      return;
    }
    setTimeout(step, previewStepMs);
  };
  setTimeout(step, previewStepMs);
}

const ui = createUpdaterBar(ipcRenderer, {
  injectSlowCss: process.argv.includes("--crm-dev-slow-css"),
  retryUntilBody: true,
  onAnnounceInstall: (btn, version) =>
    btn.addEventListener("click", () => startPreviewDownload(ui, version))
});

function applyPreviewSnapshot(version, snapshot) {
  const run = () => {
    if (snapshot === "ready") {
      ui.applyUpdateDownloaded(version);
      return;
    }
    if (snapshot === "downloading") {
      ui.applyUpdateAvailable(version);
      ui.applyDownloadProgress(45);
      return;
    }
    ui.applyUpdateAvailable(version);
  };
  if (document.body) run();
  else ui.whenBody(run);
}

function argvValue(prefix, fallback) {
  const entry = process.argv.find((a) => a.startsWith(prefix));
  if (!entry) return fallback;
  const v = entry.slice(prefix.length);
  return v === "" ? fallback : v;
}

const previewSnapshot =
  argvValue("--crm-dev-snapshot=", process.env.CRM_PREVIEW_SNAPSHOT || "banner") || "banner";
let previewDelayMs = parseInt(
  argvValue("--crm-dev-delay-ms=", process.env.CRM_PREVIEW_DELAY_MS || "1200"),
  10
);
if (!Number.isFinite(previewDelayMs)) previewDelayMs = 1200;

setTimeout(() => {
  applyPreviewSnapshot("9.9.9", previewSnapshot);
}, previewDelayMs);

contextBridge.exposeInMainWorld("crmUpdateBarDev", {
  showDownloading: (version = "9.9.9") => ui.applyUpdateAvailable(version),
  setProgress: (percent) => ui.applyDownloadProgress(percent),
  showReady: (version = "9.9.9") => ui.applyUpdateDownloaded(version),
  snapTo: (snapshot, version = "9.9.9") => applyPreviewSnapshot(version, snapshot),
  hide: () => ui.hideUpdateBar()
});
