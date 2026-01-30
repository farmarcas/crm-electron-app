const { app, BrowserWindow, screen } = require("electron");
const path = require("path");

const createWindow = () => {
  const { workArea } = screen.getPrimaryDisplay();
  const panelWidth = 400;
  const mainWindow = new BrowserWindow({
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

  mainWindow.loadURL("https://sugere-pdv-rapido.base44.app");
};

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
