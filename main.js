const { app, BrowserWindow, screen, Tray, Menu, nativeImage } = require("electron");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const APP_AUTOSTART_ID = "br.com.farmarcas.crm-electron-app";
const PRODUCT_DISPLAY_NAME = "CRM Radar";

const SUGGESTIONS_URL = "https://develop.dmpdjw0btm4j5.amplifyapp.com/";
let mainWindow;
let tray;

const TrayIcon = (() => {
  const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      table[n] = c >>> 0;
    }
    return table;
  })();

  const crc32 = (buf) => {
    let crc = 0xffffffff;
    for (const b of buf) {
      crc = CRC_TABLE[(crc ^ b) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  };

  const buildPngChunk = (type, data) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const name = Buffer.from(type);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
    return Buffer.concat([length, name, data, crc]);
  };

  const createPngBuffer = (width, height, raw) => {
    const compressed = zlib.deflateSync(raw);
    const header = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;
    ihdr[9] = 6;
    ihdr[10] = 0;
    ihdr[11] = 0;
    ihdr[12] = 0;
    return Buffer.concat([
      header,
      buildPngChunk("IHDR", ihdr),
      buildPngChunk("IDAT", compressed),
      buildPngChunk("IEND", Buffer.alloc(0))
    ]);
  };

  const createTrayPngBuffer = (size) => {
    const width = size;
    const height = size;
    const center = size / 2;
    const rx = size * 0.38;
    const ry = size * 0.14;
    const stroke = 0.12;
    const dotRadius = size * 0.07;
    const rowLength = 1 + width * 4;
    const raw = Buffer.alloc(rowLength * height);
    const drawPixel = (x, y, alpha) => {
      const rowStart = y * rowLength;
      const offset = rowStart + 1 + x * 4;
      raw[offset] = 0;
      raw[offset + 1] = 0;
      raw[offset + 2] = 0;
      raw[offset + 3] = alpha;
    };
    const isOnEllipse = (x, y, angle) => {
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const dx = x - center;
      const dy = y - center;
      const xr = dx * cos - dy * sin;
      const yr = dx * sin + dy * cos;
      const v = (xr * xr) / (rx * rx) + (yr * yr) / (ry * ry);
      return Math.abs(v - 1) <= stroke;
    };
    for (let y = 0; y < height; y += 1) {
      const rowStart = y * rowLength;
      raw[rowStart] = 0;
      for (let x = 0; x < width; x += 1) {
        const dx = x - center;
        const dy = y - center;
        const dot = dx * dx + dy * dy <= dotRadius * dotRadius;
        const e0 = isOnEllipse(x, y, 0);
        const e1 = isOnEllipse(x, y, Math.PI / 3);
        const e2 = isOnEllipse(x, y, (2 * Math.PI) / 3);
        if (dot || e0 || e1 || e2) {
          drawPixel(x, y, 255);
        }
      }
    }
    return createPngBuffer(width, height, raw);
  };

  const createImage = (sourceSize, targetSize) => {
    const image = nativeImage
      .createFromBuffer(createTrayPngBuffer(sourceSize))
      .resize({ width: targetSize, height: targetSize });
    if (process.platform === "darwin") {
      image.setTemplateImage(true);
    }
    return image;
  };

  return { createImage };
})();

const createWindow = () => {
  const { workArea } = screen.getPrimaryDisplay();
  const panelWidth = 400;
  mainWindow = new BrowserWindow({
    width: panelWidth,
    height: workArea.height,
    x: workArea.x + workArea.width - panelWidth,
    y: workArea.y,
    icon: path.join(__dirname, "assets/icon.ico"),
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
  const image = TrayIcon.createImage(64, 18);
  tray = new Tray(image);
  tray.setImage(image);
  if (process.platform === "darwin") {
    tray.setPressedImage(image);
  }
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

const configureOpenAtLogin = () => {
  if (process.platform === "linux") {
    if (!app.isPackaged) {
      return;
    }
    try {
      const autostartDir = path.join(app.getPath("home"), ".config", "autostart");
      const desktopPath = path.join(autostartDir, `${APP_AUTOSTART_ID}.desktop`);
      const execPath = process.execPath;
      const execField =
        /[\s"'\\]/.test(execPath) ? `"${execPath.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"` : execPath;
      if (!fs.existsSync(autostartDir)) {
        fs.mkdirSync(autostartDir, { recursive: true });
      }
      const desktop = [
        "[Desktop Entry]",
        "Type=Application",
        "Version=1.0",
        `Name=${PRODUCT_DISPLAY_NAME}`,
        `Exec=${execField}`,
        "Terminal=false",
        "NoDisplay=false",
        "X-GNOME-Autostart-enabled=true"
      ].join("\n");
      fs.writeFileSync(desktopPath, `${desktop}\n`, "utf8");
    } catch (err) {
      console.error("Autostart Linux (XDG):", err.message);
    }
    return;
  }

  if (process.platform === "darwin" || process.platform === "win32") {
    try {
      app.setLoginItemSettings({ openAtLogin: true });
    } catch (err) {
      console.error("setLoginItemSettings:", err.message);
    }
  }
};

app.whenReady().then(() => {
  configureOpenAtLogin();
  createWindow();
  createTray();
  if (process.platform === "darwin") {
    app.dock.setIcon(path.join(__dirname, "assets/icon"));
  }

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
