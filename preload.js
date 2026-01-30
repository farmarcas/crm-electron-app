const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("appInfo", {
  platform: process.platform,
  node: process.versions.node,
  chrome: process.versions.chrome,
  electron: process.versions.electron
});
