const path = require("node:path");
const fs = require("node:fs");
const { fileURLToPath } = require("node:url");
const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const { createDb, loadSnapshot, saveSnapshot } = require("./db.cjs");
const { createWhatsAppService } = require("./whatsapp.cjs");

const APP_NAME = "Quetta Dry Cleaners";
let mainWindow;
let db;
let dbPath;
let whatsapp = null;
let quitting = false;

const resolveLogoAbsolutePath = (logoPath) => {
  if (!logoPath) {
    return null;
  }

  const normalized = logoPath.trim();

  if (normalized.startsWith("file:///")) {
    try {
      return fileURLToPath(normalized);
    } catch {
      return null;
    }
  }

  const candidates = [];
  if (path.isAbsolute(normalized)) {
    candidates.push(normalized);
  }

  const clean = normalized.replace(/^\.\//, "").replace(/^\.\\/, "");
  candidates.push(path.join(process.resourcesPath, clean));
  candidates.push(path.join(process.resourcesPath, "assets", path.basename(clean)));
  candidates.push(path.join(__dirname, "..", clean));
  candidates.push(path.join(__dirname, "..", "assets", path.basename(clean)));

  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
};

const createMainWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1280,
    minHeight: 720,
    backgroundColor: "#0a0a0a",
    title: APP_NAME,
    icon: path.join(__dirname, "../assets/Quetta_Dry_Cleaners_Logo.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }
};

const initializeDb = () => {
  const dataDir = path.join(app.getPath("userData"), "data");
  dbPath = path.join(dataDir, "quetta_dry_cleaners.db");
  db = createDb(dbPath);
};

ipcMain.handle("db:load", async () => {
  try {
    return loadSnapshot(db);
  } catch (error) {
    return null;
  }
});

ipcMain.handle("db:save", async (_event, snapshot) => {
  try {
    saveSnapshot(db, snapshot);
    return { ok: true, message: "Data saved" };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Save failed" };
  }
});

ipcMain.handle("db:backup", async () => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: "Backup Database",
    defaultPath: `quetta-backup-${new Date().toISOString().slice(0, 10)}.db`,
    filters: [{ name: "SQLite DB", extensions: ["db", "sqlite"] }],
  });

  if (result.canceled || !result.filePath) {
    return { ok: false, message: "Backup cancelled" };
  }

  try {
    fs.copyFileSync(dbPath, result.filePath);
    return { ok: true, message: `Backup saved at ${result.filePath}` };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Backup failed" };
  }
});

ipcMain.handle("db:restore", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Restore Database",
    filters: [{ name: "SQLite DB", extensions: ["db", "sqlite"] }],
    properties: ["openFile"],
  });

  if (result.canceled || !result.filePaths[0]) {
    return { ok: false, message: "Restore cancelled" };
  }

  try {
    db.close();
    fs.copyFileSync(result.filePaths[0], dbPath);
    db = createDb(dbPath);
    return { ok: true, message: "Backup restored successfully" };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Restore failed" };
  }
});

ipcMain.handle("receipt:print", async (_event, html) => {
  const printWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      sandbox: true,
    },
  });

  await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

  return new Promise((resolve) => {
    printWindow.webContents.print(
      {
        printBackground: true,
      },
      (success) => {
        if (success) {
          resolve({ ok: true, message: "Print sent" });
        } else {
          resolve({ ok: false, message: "Print failed" });
        }
        printWindow.close();
      },
    );
  });
});

ipcMain.handle("receipt:preview", async (_event, html) => {
  const previewWindow = new BrowserWindow({
    width: 820,
    height: 980,
    title: "Receipt Preview",
    autoHideMenuBar: false,
    webPreferences: {
      sandbox: true,
    },
  });

  await previewWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  return { ok: true, message: "Preview opened" };
});

ipcMain.handle("receipt:savePdf", async (_event, html) => {
  const pdfWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      sandbox: true,
    },
  });

  await pdfWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

  const saveResult = await dialog.showSaveDialog(mainWindow, {
    title: "Save Receipt PDF",
    defaultPath: `receipt-${Date.now()}.pdf`,
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });

  if (saveResult.canceled || !saveResult.filePath) {
    pdfWindow.close();
    return { ok: false, message: "PDF save cancelled" };
  }

  try {
    const pdfData = await pdfWindow.webContents.printToPDF({
      printBackground: true,
      margins: {
        marginType: "default",
      },
      pageSize: "A4",
    });

    fs.writeFileSync(saveResult.filePath, pdfData);
    pdfWindow.close();
    return { ok: true, message: `PDF saved at ${saveResult.filePath}` };
  } catch (error) {
    pdfWindow.close();
    return { ok: false, message: error instanceof Error ? error.message : "Failed to save PDF" };
  }
});

ipcMain.handle("asset:logoDataUrl", async (_event, logoPath) => {
  try {
    const targetPath = resolveLogoAbsolutePath(logoPath);
    if (!targetPath || !fs.existsSync(targetPath)) {
      return null;
    }

    const ext = path.extname(targetPath).toLowerCase();
    const mime = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "image/png";
    const raw = fs.readFileSync(targetPath);
    return `data:${mime};base64,${raw.toString("base64")}`;
  } catch {
    return null;
  }
});

const RECEIPT_IMAGE_WIDTH = 520;

// Draws the receipt HTML in a hidden window and returns it as a PNG image (for WhatsApp).
const renderReceiptPng = async (html) => {
  const win = new BrowserWindow({
    show: false,
    width: RECEIPT_IMAGE_WIDTH,
    height: 200,
    useContentSize: true,
    webPreferences: { sandbox: true, backgroundThrottling: false },
  });

  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    await win.webContents.insertCSS("html,body{background:#fff !important}");
    const contentHeight = await win.webContents.executeJavaScript(
      "(() => { const b = document.body; return Math.ceil(b.getBoundingClientRect().bottom + (parseFloat(getComputedStyle(b).marginBottom) || 0)); })()",
    );
    const height = Math.min(Math.max(Number(contentHeight) || 0, 200), 4000);
    win.setContentSize(RECEIPT_IMAGE_WIDTH, height);
    await new Promise((resolve) => setTimeout(resolve, 300));
    const image = await win.webContents.capturePage({ x: 0, y: 0, width: RECEIPT_IMAGE_WIDTH, height });
    const png = image.toPNG();
    if (!png || png.length < 1000) {
      throw new Error("Receipt image came out empty");
    }
    return png;
  } finally {
    if (!win.isDestroyed()) {
      win.close();
    }
  }
};

const readInstalledWhatsAppVersion = () => {
  try {
    return require("whatsapp-web.js/package.json").version;
  } catch {
    const appPackage = require(path.join(__dirname, "..", "package.json"));
    return String(appPackage.dependencies?.["whatsapp-web.js"] ?? "").replace(/^[^\d]*/, "");
  }
};

const fetchLatestWhatsAppVersion = async () => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch("https://registry.npmjs.org/whatsapp-web.js/latest", { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`npm registry returned ${response.status}`);
    }
    const data = await response.json();
    return typeof data.version === "string" ? data.version : "";
  } finally {
    clearTimeout(timeout);
  }
};

const startWhatsApp = () => {
  try {
    whatsapp = createWhatsAppService({
      getDb: () => db,
      userDataDir: app.getPath("userData"),
      renderReceiptPng,
      loadLibrary: () => require("whatsapp-web.js"),
      toQrDataUrl: (text) => require("qrcode").toDataURL(text, { margin: 1, width: 280 }),
      getInstalledVersion: readInstalledWhatsAppVersion,
      fetchLatestVersion: fetchLatestWhatsAppVersion,
    });
    whatsapp.start();
  } catch (error) {
    // WhatsApp must never stop the shop software from opening.
    console.error("WhatsApp could not start:", error);
    whatsapp = null;
  }
};

const unavailableStatus = {
  enabled: false,
  state: "DISABLED",
  qr: null,
  connectedAs: "",
  lastError: "WhatsApp module is not available in this build.",
  pending: 0,
  failed: 0,
  sent: 0,
  installedVersion: "",
  latestVersion: "",
  updateAvailable: false,
  browserFound: false,
  recent: [],
};

const whatsappCall = async (action, fallback) => {
  if (!whatsapp) {
    return fallback;
  }
  try {
    return await action(whatsapp);
  } catch (error) {
    return { ...fallback, lastError: error instanceof Error ? error.message : "WhatsApp error" };
  }
};

ipcMain.handle("whatsapp:status", () => whatsappCall((wa) => wa.getStatus(), unavailableStatus));
ipcMain.handle("whatsapp:setEnabled", (_event, enabled) => whatsappCall((wa) => wa.setEnabled(enabled), unavailableStatus));
ipcMain.handle("whatsapp:relink", () => whatsappCall((wa) => wa.relink(), unavailableStatus));
ipcMain.handle("whatsapp:retryFailed", () => whatsappCall((wa) => wa.retryFailed(), unavailableStatus));
ipcMain.handle("whatsapp:checkUpdate", () => whatsappCall((wa) => wa.checkForUpdate(), unavailableStatus));
ipcMain.handle("whatsapp:queue", (_event, payload) =>
  whatsappCall((wa) => wa.enqueue(payload ?? {}), { ok: false, queued: false, reason: "unavailable" }),
);

ipcMain.handle("app:dataPath", async () => app.getPath("userData"));

app.whenReady().then(() => {
  app.setName(APP_NAME);
  initializeDb();
  createMainWindow();
  startWhatsApp();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", (event) => {
  if (whatsapp && !quitting) {
    // Close the hidden WhatsApp browser cleanly before the app exits.
    event.preventDefault();
    quitting = true;
    Promise.race([whatsapp.stop(), new Promise((resolve) => setTimeout(resolve, 5000))])
      .catch(() => {})
      .finally(() => {
        if (db) {
          db.close();
          db = null;
        }
        app.quit();
      });
    return;
  }

  if (db) {
    db.close();
    db = null;
  }
});