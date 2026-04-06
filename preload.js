const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("appInfo", {
  platform: process.platform,
  node: process.versions.node,
  chrome: process.versions.chrome,
  electron: process.versions.electron
});

function ensureStyles() {
  if (document.getElementById("crm-update-styles")) return;
  const style = document.createElement("style");
  style.id = "crm-update-styles";
  style.textContent = `
    #crm-update-bar {
      position: fixed;
      top: -80px;
      left: 0;
      right: 0;
      z-index: 999999;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 13px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      transition: top 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
    }
    #crm-update-bar.visible { top: 0; }
    #crm-update-inner {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 14px;
      background: #1e293b;
      color: #f1f5f9;
    }
    #crm-update-icon { font-size: 16px; flex-shrink: 0; }
    #crm-update-text { flex: 1; line-height: 1.4; }
    #crm-update-text strong { display: block; font-size: 13px; color: #fff; }
    #crm-update-text span { font-size: 11px; color: #94a3b8; }
    #crm-update-progress-wrap {
      height: 3px;
      background: #334155;
    }
    #crm-update-progress-bar {
      height: 100%;
      background: linear-gradient(90deg, #3b82f6, #60a5fa);
      width: 0%;
      transition: width 0.4s ease;
    }
    .crm-btn {
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 600;
      padding: 5px 12px;
      white-space: nowrap;
      transition: opacity 0.15s;
    }
    .crm-btn:hover { opacity: 0.85; }
    #crm-btn-install {
      background: #22c55e;
      color: #fff;
    }
    #crm-btn-dismiss {
      background: transparent;
      color: #64748b;
      font-size: 16px;
      padding: 2px 6px;
    }
  `;
  document.head.appendChild(style);
}

function getOrCreateBar() {
  ensureStyles();
  let bar = document.getElementById("crm-update-bar");
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "crm-update-bar";
    bar.innerHTML = `
      <div id="crm-update-inner">
        <span id="crm-update-icon">⬇️</span>
        <div id="crm-update-text">
          <strong id="crm-update-title"></strong>
          <span id="crm-update-sub"></span>
        </div>
        <button class="crm-btn" id="crm-btn-dismiss">✕</button>
      </div>
      <div id="crm-update-progress-wrap">
        <div id="crm-update-progress-bar"></div>
      </div>
    `;
    document.body.prepend(bar);
    requestAnimationFrame(() => bar.classList.add("visible"));
    document.getElementById("crm-btn-dismiss").addEventListener("click", () => {
      bar.classList.remove("visible");
      setTimeout(() => bar.remove(), 400);
    });
  }
  return bar;
}

ipcRenderer.on("update-available", (_, version) => {
  const bar = getOrCreateBar();
  document.getElementById("crm-update-icon").textContent = "⬇️";
  document.getElementById("crm-update-title").textContent = `Nova versão ${version} disponível`;
  document.getElementById("crm-update-sub").textContent = "Baixando em segundo plano...";
  document.getElementById("crm-update-progress-bar").style.width = "0%";
  const existing = document.getElementById("crm-btn-install");
  if (existing) existing.remove();
});

ipcRenderer.on("download-progress", (_, percent) => {
  const bar = document.getElementById("crm-update-bar");
  if (!bar) return;
  document.getElementById("crm-update-progress-bar").style.width = `${percent}%`;
  document.getElementById("crm-update-sub").textContent = `Baixando... ${percent}%`;
});

ipcRenderer.on("update-downloaded", (_, version) => {
  const bar = getOrCreateBar();
  document.getElementById("crm-update-icon").textContent = "✅";
  document.getElementById("crm-update-title").textContent = `Versão ${version} pronta para instalar`;
  document.getElementById("crm-update-sub").textContent = "Reinicie para aplicar a atualização.";
  document.getElementById("crm-update-progress-bar").style.width = "100%";
  document.getElementById("crm-update-progress-bar").style.background = "#22c55e";

  if (!document.getElementById("crm-btn-install")) {
    const btn = document.createElement("button");
    btn.className = "crm-btn";
    btn.id = "crm-btn-install";
    btn.textContent = "Reiniciar agora";
    btn.addEventListener("click", () => ipcRenderer.send("install-update"));
    document.getElementById("crm-update-inner").insertBefore(
      btn,
      document.getElementById("crm-btn-dismiss")
    );
  }
});
