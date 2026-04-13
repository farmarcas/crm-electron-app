"use strict";

/** Barra de atualização + listeners do electron-updater (incluído no build). */

function whenBody(fn, maxFrames = 240) {
  let frames = 0;
  const tick = () => {
    if (document.body) {
      fn();
      return;
    }
    frames += 1;
    if (frames >= maxFrames) return;
    requestAnimationFrame(tick);
  };
  tick();
}

module.exports = function createUpdaterBar(ipcRenderer, opts = {}) {
  const {
    injectSlowCss = false,
    retryUntilBody = false,
    onAnnounceInstall = null
  } = opts;

  function ensureStyles() {
    if (document.getElementById("crm-update-styles")) return;
    const style = document.createElement("style");
    style.id = "crm-update-styles";
    style.textContent = `
    :root {
      --crm-update-bar-color-button-primary: #0091FF;
      --crm-update-bar-color-button-secondary: #97A0AF;
      --crm-update-bar-color-background: #061938;
      --crm-update-bar-color-text-primary: #fff;
      --crm-update-bar-color-text-secondary: #fff;
    }
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
      flex-wrap: wrap;
      align-items: center;
      gap: 4px;
      padding: 16px;
      background: var(--crm-update-bar-color-background);
      color: var(--crm-update-bar-color-text-primary, #fff);
    }
    #crm-update-text { flex: 1; line-height: 1.4;}
    #crm-update-text #crm-update-title { display: block; font-size: 13px; color: #fff; margin-bottom: 8px; font-weight: 700; }
    #crm-update-text #crm-update-sub { font-size: 11px; color: var(--crm-update-bar-color-text-secondary, #fff); }
    #crm-actions {
      display: flex;
      width: 100%;
      gap: 8px;
      justify-content: space-between;
      align-items:center;
    }
    .crm-btn {
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 700;
      line-height: 1.2;
      padding: 8px 12px;
      white-space: nowrap;
      transition: opacity 0.15s;
    }
    .crm-btn:hover { opacity: 0.85; }
    #crm-btn-install {
      background: var(--crm-update-bar-color-button-primary);
      color: #fff;
    }
    #crm-btn-dismiss {
      background: transparent;
      color: var(--crm-update-bar-color-button-secondary);
      padding: 8px 0;
    }

    #crm-btn-restart { 
      display: none; 
      background: var(--crm-update-bar-color-button-primary);
      color: #fff;
    }
    
    #crm-update-loader {
      display:none;
      width: 32px;
    }
    #crm-update-loader svg {
      width: 100%;
      height: 100%;
      animation: l3 1s infinite linear;
    }
    @keyframes l3 {to{transform: rotate(1turn)}}
  `;
    document.head.appendChild(style);
    if (injectSlowCss && !document.getElementById("crm-dev-slow-css")) {
      const slow = document.createElement("style");
      slow.id = "crm-dev-slow-css";
      slow.textContent = `
      #crm-update-bar { transition: top 2.5s cubic-bezier(0.34, 1.56, 0.64, 1) !important; }
    `;
      document.head.appendChild(slow);
    }
  }

  function getOrCreateBar() {
    ensureStyles();
    let bar = document.getElementById("crm-update-bar");
    if (!bar) {
      if (!document.body) return null;
      bar = document.createElement("div");
      bar.id = "crm-update-bar";
      bar.innerHTML = `
      <div id="crm-update-inner">
        <div id="crm-update-text">
          <p id="crm-update-title"></p>
          <p id="crm-update-sub"></p>
        </div>
        <div id="crm-update-loader">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M28 16.0001C27.9999 18.5342 27.1975 21.0032 25.7079 23.0533C24.2183 25.1034 22.1179 26.6293 19.7078 27.4123C17.2977 28.1953 14.7016 28.1952 12.2915 27.4121C9.88145 26.629 7.78117 25.103 6.29169 23.0528C4.8022 21.0026 3.99998 18.5335 4 15.9994C4.00002 13.4653 4.80227 10.9962 6.29179 8.9461C7.7813 6.89595 9.88161 5.36998 12.2917 4.58687C14.7018 3.80376 17.2979 3.80373 19.708 4.58677" stroke="#0091FF" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <button class="crm-btn" id="crm-btn-restart">Reiniciar</button>
        <div id="crm-actions">
          <button class="crm-btn" id="crm-btn-dismiss">Lembrar depois</button>
          <button class="crm-btn" id="crm-btn-install">Atualizar agora</button>
        </div>
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

  function applyUpdateAvailable(version) {
    const bar = getOrCreateBar();
    if (!bar) {
      if (retryUntilBody) whenBody(() => applyUpdateAvailable(version));
      return;
    }
    document.getElementById("crm-update-title").textContent = "Nova versão disponível 🚀";
    document.getElementById("crm-update-sub").textContent = `A versão ${version} traz melhorias de desempenho.`;

    const installBtn = document.getElementById("crm-btn-install");
    if (installBtn) {
      const fresh = installBtn.cloneNode(true);
      installBtn.replaceWith(fresh);
      if (onAnnounceInstall) onAnnounceInstall(fresh, version);
    }
  }

  function applyDownloadProgress(percent) {
    const bar = document.getElementById("crm-update-bar");
    if (!bar) return;
    document.getElementById("crm-actions").style.display = "none";
    document.getElementById("crm-update-title").innerText = 'Atualizando o sistema 🔄'
    document.getElementById("crm-update-sub").innerText = 'Isso pode levar alguns instantes.';
    document.getElementById("crm-update-loader").style.display = "block";
  }

  function applyUpdateDownloaded(version) {
    const bar = getOrCreateBar();
    if (!bar) {
      if (retryUntilBody) whenBody(() => applyUpdateDownloaded(version));
      return;
    }
    document.getElementById("crm-update-loader").style.display = "none";
    document.getElementById("crm-update-title").textContent = "Atualização pronta ✅";
    document.getElementById("crm-update-sub").textContent = `Reinicie o sistema para aplicar as melhorias.`;

    const installBtn = document.getElementById("crm-btn-restart");

    if (installBtn) {
      installBtn.style.display = "block";
      const fresh = installBtn.cloneNode(true);
      installBtn.replaceWith(fresh);
      fresh.addEventListener("click", () => ipcRenderer.send("install-update"));
    }
  }

  function hideUpdateBar() {
    const bar = document.getElementById("crm-update-bar");
    if (!bar) return;
    bar.classList.remove("visible");
    setTimeout(() => bar.remove(), 400);
  }

  ipcRenderer.on("update-available", (_, version) => applyUpdateAvailable(version));
  ipcRenderer.on("download-progress", (_, percent) => applyDownloadProgress(percent));
  ipcRenderer.on("update-downloaded", (_, version) => applyUpdateDownloaded(version));

  return {
    applyUpdateAvailable,
    applyDownloadProgress,
    applyUpdateDownloaded,
    hideUpdateBar,
    whenBody
  };
};
