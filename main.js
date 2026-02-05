const { app, BrowserWindow, screen, Tray, Menu, nativeImage } = require("electron");
const path = require("path");

const SUGGESTIONS_URL = "https://sugere-pdv-rapido.base44.app";
let mainWindow;
let tray;

const createWindow = () => {
  const { workArea } = screen.getPrimaryDisplay();
  const panelWidth = 400;
  mainWindow = new BrowserWindow({
    width: panelWidth,
    height: workArea.height,
    x: workArea.x + workArea.width - panelWidth,
    y: workArea.y,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadURL(SUGGESTIONS_URL);
  mainWindow.setMenu(null);

  mainWindow.on("close", (event) => {
    if (!app.isQuiting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
};

const createTray = () => {
  const trayIconSvg =
    "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNiIgaGVpZ2h0PSIxNiIgdmlld0JveD0iMCAwIDE2IDE2Ij48Y2lyY2xlIGN4PSI4IiBjeT0iOCIgcj0iMS4yIiBmaWxsPSIjMDAwMDAwIi8+PGVsbGlwc2UgY3g9IjgiIGN5PSI4IiByeD0iNiIgcnk9IjIuMiIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjMDAwMDAwIiBzdHJva2Utd2lkdGg9IjEiLz48ZWxsaXBzZSBjeD0iOCIgY3k9IjgiIHJ4PSI2IiByeT0iMi4yIiBmaWxsPSJub25lIiBzdHJva2U9IiMwMDAwMDAiIHN0cm9rZS13aWR0aD0iMSIgdHJhbnNmb3JtPSJyb3RhdGUoNjAgOCA4KSIvPjxlbGxpcHNlIGN4PSI4IiBjeT0iOCIgcng9IjYiIHJ5PSIyLjIiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzAwMDAwMCIgc3Ryb2tlLXdpZHRoPSIxIiB0cmFuc2Zvcm09InJvdGF0ZSgxMjAgOCA4KSIvPjwvc3ZnPg==";
  const image = nativeImage
    .createFromDataURL(trayIconSvg)
    .resize({ width: 16, height: 16 });
  if (process.platform === "darwin") {
    image.setTemplateImage(true);
  }
  tray = new Tray(image);
  tray.setToolTip("Sugestões");
  tray.on("click", () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.focus();
      } else {
        mainWindow.show();
      }
    }
  });
  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Abrir sugestões",
      click: () => {
        if (!mainWindow) {
          createWindow();
        }
        mainWindow.show();
        mainWindow.focus();
      }
    },
    {
      label: "Sair",
      click: () => {
        app.isQuiting = true;
        app.quit();
      }
    }
  ]);
  tray.setContextMenu(contextMenu);
};

app.whenReady().then(() => {
  createWindow();
  createTray();

  app.on("activate", () => {
    if (!mainWindow) {
      createWindow();
    } else if (!mainWindow.isVisible()) {
      mainWindow.show();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    if (app.isQuiting) {
      app.quit();
    }
  }
});
