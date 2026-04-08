const { contextBridge, ipcRenderer } = require("electron");
const createUpdaterBar = require("./preload-updater-ui.js");

contextBridge.exposeInMainWorld("appInfo", {
  platform: process.platform,
  node: process.versions.node,
  chrome: process.versions.chrome,
  electron: process.versions.electron
});

createUpdaterBar(ipcRenderer, {});
