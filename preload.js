const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("appInfo", {
  platform: process.platform,
  node: process.versions.node,
  chrome: process.versions.chrome,
  electron: process.versions.electron
});

ipcRenderer.on("update-available", (_, version) => {
  if (document.getElementById("crm-update-bar")) return;

  const bar = document.createElement("div");
  bar.id = "crm-update-bar";
  bar.style.cssText = [
    "position:fixed", "top:0", "left:0", "right:0", "z-index:999999",
    "background:#f59e0b", "color:#1c1917", "font-family:sans-serif",
    "font-size:13px", "font-weight:600", "padding:8px 16px",
    "display:flex", "align-items:center", "justify-content:space-between",
    "box-shadow:0 2px 6px rgba(0,0,0,0.25)"
  ].join(";");

  bar.innerHTML = `
    <span>🔄 Nova versão ${version} disponível — baixando em segundo plano...</span>
    <button id="crm-update-close" style="
      background:none;border:none;cursor:pointer;font-size:16px;
      color:#1c1917;padding:0 4px;line-height:1
    ">✕</button>
  `;

  document.body.prepend(bar);

  document.getElementById("crm-update-close").addEventListener("click", () => bar.remove());
});

ipcRenderer.on("update-downloaded", (_, version) => {
  const bar = document.getElementById("crm-update-bar");
  if (bar) {
    bar.style.background = "#22c55e";
    bar.style.color = "#fff";
    bar.innerHTML = `
      <span>✅ Versão ${version} baixada e pronta para instalar.</span>
      <button id="crm-update-install" style="
        background:#fff;border:none;cursor:pointer;font-size:12px;font-weight:700;
        color:#166534;padding:4px 12px;border-radius:4px;margin-left:12px
      ">Reiniciar agora</button>
    `;
    document.getElementById("crm-update-install").addEventListener("click", () =>
      ipcRenderer.send("install-update")
    );
  }
});
