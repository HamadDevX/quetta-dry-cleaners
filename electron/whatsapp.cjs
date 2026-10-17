"use strict";

/**
 * WhatsApp auto-messages for Quetta Dry Cleaners.
 *
 * - Runs only in the Electron main process.
 * - Uses whatsapp-web.js (pinned version) with a Chromium bundled in the installer (falls back to Chrome/Edge on the PC).
 * - Messages are first stored in a small queue table (whatsapp_queue) and sent in the background,
 *   so saving an order never waits for, or fails because of, WhatsApp / internet.
 * - It never touches the existing tables (orders, customers, ...).
 */

const fs = require("node:fs");
const path = require("node:path");

const CONFIG_KEY = "whatsapp_config";
const MAX_ATTEMPTS = 5;
const EXPIRE_MS = 72 * 60 * 60 * 1000; // unsent messages older than 72h are dropped
const TICK_MS = 4000;
const MIN_GAP_MS = 3000; // random pause between two messages (looks natural, safer for the number)
const MAX_GAP_MS = 8000;
const RECONNECT_MS = 30 * 1000;
const UPDATE_CHECK_MS = 24 * 60 * 60 * 1000;
const RETRY_BACKOFF_MS = [60 * 1000, 2 * 60 * 1000, 5 * 60 * 1000, 10 * 60 * 1000, 20 * 60 * 1000];

/* ------------------------------------------------------------------ helpers */

/**
 * "0300 1234567" / "+92 300 1234567" / "03001234567" -> "923001234567".
 * Returns null when the number cannot be a WhatsApp mobile number.
 */
const normalizePhone = (raw) => {
  const text = String(raw ?? "").trim();
  if (!text) {
    return null;
  }
  const hadPlus = text.startsWith("+");
  let digits = text.replace(/\D/g, "");
  if (!digits) {
    return null;
  }

  if (digits.startsWith("00")) {
    digits = digits.slice(2);
  } else if (!hadPlus) {
    if (digits.startsWith("0")) {
      digits = `92${digits.slice(1)}`;
    } else if (digits.length === 10 && digits.startsWith("3")) {
      digits = `92${digits}`;
    }
  }

  if (digits.startsWith("92")) {
    // Pakistani mobile numbers: 92 3xx xxxxxxx (12 digits). Landlines are not on WhatsApp.
    return digits.length === 12 && digits[2] === "3" ? digits : null;
  }
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
};

const compareVersions = (a, b) => {
  const pa = String(a).split(/[.-]/).map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split(/[.-]/).map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length, 3); i += 1) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) {
      return diff > 0 ? 1 : -1;
    }
  }
  return 0;
};

const errorText = (error) => {
  const text = error instanceof Error ? error.message : String(error ?? "Unknown error");
  return text.split("\n")[0].slice(0, 300);
};

/** Looks for chrome.exe (or chrome) inside a folder, a few levels deep. */
const findChromeIn = (dir, depth = 5) => {
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isFile() && (entry.name === "chrome.exe" || entry.name === "chrome")) {
        return full;
      }
      if (entry.isDirectory() && depth > 0) {
        const found = findChromeIn(full, depth - 1);
        if (found) {
          return found;
        }
      }
    }
  } catch {
    // folder missing: nothing bundled
  }
  return null;
};

/** 1) Chromium bundled with the app, 2) a custom path, 3) Chrome / Edge installed on the PC. */
const findBrowser = (customPath) => {
  const bundledDirs = [
    process.resourcesPath && path.join(process.resourcesPath, "chromium"), // installed app
    path.join(__dirname, "..", ".cache", "puppeteer", "chrome"), // running from the project folder
  ].filter(Boolean);
  for (const dir of bundledDirs) {
    const bundled = findChromeIn(dir);
    if (bundled) {
      return bundled;
    }
  }

  const candidates = [];
  if (customPath) {
    candidates.push(customPath);
  }
  const programFiles = process.env["ProgramFiles"] || "C:\\Program Files";
  const programFilesX86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
  const localAppData = process.env["LOCALAPPDATA"] || "";

  candidates.push(
    path.join(programFiles, "Google", "Chrome", "Application", "chrome.exe"),
    path.join(programFilesX86, "Google", "Chrome", "Application", "chrome.exe"),
    localAppData && path.join(localAppData, "Google", "Chrome", "Application", "chrome.exe"),
    path.join(programFilesX86, "Microsoft", "Edge", "Application", "msedge.exe"),
    path.join(programFiles, "Microsoft", "Edge", "Application", "msedge.exe"),
    // Linux / macOS (only useful while developing)
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  );

  return candidates.filter(Boolean).find((candidate) => {
    try {
      return fs.existsSync(candidate);
    } catch {
      return false;
    }
  }) ?? null;
};

const schemaReady = new WeakSet();

const ensureSchema = (db) => {
  if (schemaReady.has(db)) {
    return;
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS whatsapp_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT NOT NULL,
      order_number TEXT NOT NULL,
      kind TEXT NOT NULL,
      phone TEXT NOT NULL,
      target TEXT NOT NULL DEFAULT '',
      caption TEXT NOT NULL,
      receipt_html TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'PENDING',
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT NOT NULL DEFAULT '',
      created_ms INTEGER NOT NULL,
      next_attempt_ms INTEGER NOT NULL DEFAULT 0,
      sent_ms INTEGER,
      UNIQUE (order_id, kind)
    );
  `);
  schemaReady.add(db);
};

const defaultConfig = () => ({ enabled: false, browserPath: "", latestVersion: "", lastUpdateCheck: 0 });

const readConfig = (db) => {
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(CONFIG_KEY);
    return { ...defaultConfig(), ...(row ? JSON.parse(row.value) : {}) };
  } catch {
    return defaultConfig();
  }
};

const writeConfig = (db, config) => {
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(CONFIG_KEY, JSON.stringify(config));
};

/* ------------------------------------------------------------------ service */

/**
 * @param {object} deps
 * @param {() => any} deps.getDb                         returns the current SQLite handle (it changes after a restore)
 * @param {string} deps.userDataDir                      Electron userData folder (session is stored inside it)
 * @param {(html: string) => Promise<Buffer>} deps.renderReceiptPng
 * @param {() => any} deps.loadLibrary                   returns { Client, LocalAuth, MessageMedia }
 * @param {(text: string) => Promise<string>} deps.toQrDataUrl
 * @param {() => string} deps.getInstalledVersion
 * @param {() => Promise<string>} deps.fetchLatestVersion
 * @param {(customPath: string) => (string|null)} [deps.findBrowser]
 * @param {() => number} [deps.now]
 * @param {object} [deps.log]
 */
const createWhatsAppService = (deps) => {
  const {
    getDb,
    userDataDir,
    renderReceiptPng,
    loadLibrary,
    toQrDataUrl,
    getInstalledVersion,
    fetchLatestVersion,
    findBrowser: findBrowserFn = findBrowser,
    now = () => Date.now(),
    log = console,
  } = deps;

  const sessionDir = path.join(userDataDir, "whatsapp-session");

  let lib = null;
  let client = null;
  let state = "DISABLED"; // DISABLED | STARTING | QR | CONNECTING | READY | DISCONNECTED | ERROR
  let qrDataUrl = null;
  let connectedAs = "";
  let lastError = "";
  let starting = false;
  let busy = false;
  let nextSendAt = 0;
  let nextConnectAt = 0;
  let timer = null;
  let stopped = false;

  const db = () => {
    const handle = getDb();
    if (!handle) {
      throw new Error("Database is not ready");
    }
    ensureSchema(handle);
    return handle;
  };

  const config = () => readConfig(db());

  const randomGap = () => MIN_GAP_MS + Math.floor(Math.random() * (MAX_GAP_MS - MIN_GAP_MS));

  /* ----------------------------- connection ----------------------------- */

  const destroyClient = async () => {
    const current = client;
    client = null;
    qrDataUrl = null;
    connectedAs = "";
    if (!current) {
      return;
    }
    try {
      await Promise.race([current.destroy(), new Promise((resolve) => setTimeout(resolve, 5000))]);
    } catch (error) {
      log.warn?.("[whatsapp] destroy failed:", errorText(error));
    }
  };

  const connect = async () => {
    if (client || starting || stopped) {
      return;
    }
    starting = true;
    state = "STARTING";
    lastError = "";
    qrDataUrl = null;

    try {
      const cfg = config();
      lib = lib ?? loadLibrary();
      const browser = findBrowserFn(cfg.browserPath);
      if (!browser) {
        throw new Error("The WhatsApp browser (Chromium) was not found. Re-run npm install and rebuild the installer, or install Google Chrome on this PC.");
      }

      const instance = new lib.Client({
        authStrategy: new lib.LocalAuth({ clientId: "quetta", dataPath: sessionDir }),
        puppeteer: {
          headless: true,
          executablePath: browser,
          args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"],
        },
      });

      instance.on("qr", (qr) => {
        if (client !== instance) {
          return;
        }
        state = "QR";
        toQrDataUrl(qr)
          .then((url) => {
            if (client === instance && state === "QR") {
              qrDataUrl = url;
            }
          })
          .catch(() => {});
      });
      instance.on("authenticated", () => {
        if (client === instance) {
          state = "CONNECTING";
          qrDataUrl = null;
        }
      });
      instance.on("auth_failure", (message) => {
        if (client === instance) {
          state = "ERROR";
          lastError = `Login failed: ${message}`;
          qrDataUrl = null;
        }
      });
      instance.on("ready", () => {
        if (client === instance) {
          state = "READY";
          qrDataUrl = null;
          lastError = "";
          connectedAs = instance.info?.wid?.user ?? "";
        }
      });
      instance.on("disconnected", (reason) => {
        if (client === instance) {
          state = "DISCONNECTED";
          lastError = `WhatsApp disconnected (${reason}). It will reconnect automatically.`;
          nextConnectAt = now() + RECONNECT_MS;
          destroyClient().catch(() => {});
        }
      });

      client = instance;
      await instance.initialize();
    } catch (error) {
      state = "ERROR";
      lastError = errorText(error);
      log.warn?.("[whatsapp] connect failed:", lastError);
      nextConnectAt = now() + RECONNECT_MS;
      await destroyClient();
    } finally {
      starting = false;
    }
  };

  /* ------------------------------- queue -------------------------------- */

  const enqueue = ({ orderId, orderNumber, kind, phone, caption, html }) => {
    const handle = db();
    const cfg = readConfig(handle);

    if (!cfg.enabled) {
      return { ok: true, queued: false, reason: "disabled" };
    }
    if (!orderId || !orderNumber || !["CONFIRM", "READY", "DELIVERED"].includes(kind) || !caption) {
      return { ok: false, queued: false, reason: "bad_request", message: "Invalid WhatsApp request" };
    }

    const existing = handle.prepare("SELECT id FROM whatsapp_queue WHERE order_id = ? AND kind = ?").get(orderId, kind);
    if (existing) {
      return { ok: true, queued: false, reason: "duplicate" };
    }

    const target = normalizePhone(phone);
    handle
      .prepare(
        `INSERT INTO whatsapp_queue
          (order_id, order_number, kind, phone, target, caption, receipt_html, status, attempts, last_error, created_ms, next_attempt_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 0)`,
      )
      .run(
        orderId,
        orderNumber,
        kind,
        String(phone ?? ""),
        target ?? "",
        caption,
        kind === "CONFIRM" ? String(html ?? "") : "",
        target ? "PENDING" : "FAILED",
        target ? "" : "Invalid WhatsApp phone number",
        now(),
      );

    if (!target) {
      return { ok: true, queued: false, reason: "invalid_phone" };
    }

    setTimeout(() => tick().catch(() => {}), 50);
    return { ok: true, queued: true };
  };

  const sendJob = async (job) => {
    const numberId = await client.getNumberId(job.target);
    if (!numberId) {
      const error = new Error("This number is not on WhatsApp");
      error.permanent = true;
      throw error;
    }
    const chatId = numberId._serialized;

    if (job.kind === "CONFIRM" && job.receipt_html) {
      try {
        const png = await renderReceiptPng(job.receipt_html);
        const media = new lib.MessageMedia("image/png", png.toString("base64"), `receipt-${job.order_number}.png`);
        await client.sendMessage(chatId, media, { caption: job.caption, sendSeen: false });
      } catch (error) {
        // Safety net: if images keep failing (WhatsApp changes break them from time to time),
        // the customer still gets the confirmation as a normal text message.
        if (job.attempts >= 2 && !/markedUnread/i.test(errorText(error))) {
          const textOnly = job.caption.replace(/Your receipt is attached above\.\s*/, "");
          await client.sendMessage(chatId, textOnly, { sendSeen: false });
          return { note: `Sent as text only (image failed: ${errorText(error)})` };
        }
        throw error;
      }
    } else {
      await client.sendMessage(chatId, job.caption, { sendSeen: false });
    }
    return {};
  };

  const markSent = (handle, job, note = "") => {
    handle
      .prepare("UPDATE whatsapp_queue SET status = 'SENT', sent_ms = ?, last_error = ?, receipt_html = '', attempts = attempts + 1 WHERE id = ?")
      .run(now(), note, job.id);
  };

  const markFailure = (handle, job, error) => {
    const attempts = job.attempts + 1;
    const message = errorText(error);
    if (error?.permanent || attempts >= MAX_ATTEMPTS) {
      handle
        .prepare("UPDATE whatsapp_queue SET status = 'FAILED', attempts = ?, last_error = ? WHERE id = ?")
        .run(attempts, message, job.id);
      return;
    }
    const wait = RETRY_BACKOFF_MS[Math.min(attempts - 1, RETRY_BACKOFF_MS.length - 1)];
    handle
      .prepare("UPDATE whatsapp_queue SET attempts = ?, last_error = ?, next_attempt_ms = ? WHERE id = ?")
      .run(attempts, message, now() + wait, job.id);
  };

  const processQueue = async () => {
    const handle = db();
    const t = now();

    handle
      .prepare("UPDATE whatsapp_queue SET status = 'FAILED', last_error = 'Expired (not sent within 72 hours)' WHERE status = 'PENDING' AND created_ms < ?")
      .run(t - EXPIRE_MS);

    if (!client || state !== "READY" || t < nextSendAt) {
      return;
    }

    // Messages of one order always go in order: receipt (CONFIRM), then READY, then DELIVERED.
    const job = handle
      .prepare(
        `SELECT * FROM whatsapp_queue q
         WHERE q.status = 'PENDING' AND q.next_attempt_ms <= ?
           AND NOT (q.kind IN ('READY', 'DELIVERED') AND EXISTS (
             SELECT 1 FROM whatsapp_queue c WHERE c.order_id = q.order_id AND c.kind = 'CONFIRM' AND c.status = 'PENDING'))
           AND NOT (q.kind = 'DELIVERED' AND EXISTS (
             SELECT 1 FROM whatsapp_queue c WHERE c.order_id = q.order_id AND c.kind = 'READY' AND c.status = 'PENDING'))
         ORDER BY q.id LIMIT 1`,
      )
      .get(t);
    if (!job) {
      return;
    }

    try {
      const result = await sendJob(job);
      markSent(handle, job, result?.note ?? "");
    } catch (error) {
      // Known whatsapp-web.js quirk: the message is already delivered but a later internal step throws.
      if (/markedUnread/i.test(errorText(error))) {
        markSent(handle, job);
      } else {
        markFailure(handle, job, error);
      }
    }
    nextSendAt = now() + randomGap();
  };

  const checkForUpdate = async (force) => {
    try {
      const handle = db();
      const cfg = readConfig(handle);
      if (!force && now() - cfg.lastUpdateCheck < UPDATE_CHECK_MS) {
        return;
      }
      const latest = await fetchLatestVersion();
      if (latest) {
        writeConfig(handle, { ...readConfig(handle), latestVersion: latest, lastUpdateCheck: now() });
      }
    } catch {
      // No internet or registry unreachable: try again at the next check.
    }
  };

  const tick = async () => {
    if (busy || stopped) {
      return;
    }
    busy = true;
    try {
      const cfg = config();
      if (!cfg.enabled && (client || state !== "DISABLED")) {
        // switched off (for example by restoring an old backup)
        await destroyClient();
        state = "DISABLED";
      }
      if (cfg.enabled && !client && !starting && now() >= nextConnectAt) {
        connect().catch(() => {});
      }
      await processQueue();
      if (cfg.enabled) {
        await checkForUpdate(false);
      }
    } catch (error) {
      log.warn?.("[whatsapp] tick failed:", errorText(error));
    } finally {
      busy = false;
    }
  };

  /* ------------------------------ public API ---------------------------- */

  const start = () => {
    stopped = false;
    if (timer) {
      return;
    }
    const cfg = config();
    state = cfg.enabled ? "STARTING" : "DISABLED";
    timer = setInterval(() => tick().catch(() => {}), TICK_MS);
    tick().catch(() => {});
  };

  const stop = async () => {
    stopped = true;
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    await destroyClient();
  };

  const setEnabled = async (enabled) => {
    const handle = db();
    writeConfig(handle, { ...readConfig(handle), enabled: Boolean(enabled) });
    if (enabled) {
      stopped = false;
      nextConnectAt = 0;
      state = "STARTING";
      if (!timer) {
        start();
      }
      connect().catch(() => {});
    } else {
      await destroyClient();
      state = "DISABLED";
      lastError = "";
    }
    return getStatus();
  };

  /** Unlink this PC from WhatsApp and show a fresh QR code. */
  const relink = async () => {
    await destroyClient();
    try {
      fs.rmSync(sessionDir, { recursive: true, force: true });
    } catch (error) {
      log.warn?.("[whatsapp] could not clear session:", errorText(error));
    }
    nextConnectAt = 0;
    if (config().enabled) {
      connect().catch(() => {});
    }
    return getStatus();
  };

  const retryFailed = () => {
    const handle = db();
    handle
      .prepare(
        "UPDATE whatsapp_queue SET status = 'PENDING', attempts = 0, next_attempt_ms = 0, created_ms = ?, last_error = '' WHERE status = 'FAILED' AND target <> ''",
      )
      .run(now());
    return getStatus();
  };

  const getStatus = () => {
    const handle = db();
    const cfg = readConfig(handle);
    const counts = handle
      .prepare("SELECT status, COUNT(*) AS c FROM whatsapp_queue GROUP BY status")
      .all()
      .reduce((acc, row) => ({ ...acc, [row.status]: row.c }), {});
    const recent = handle
      .prepare("SELECT order_number, kind, phone, status, attempts, last_error, created_ms, sent_ms FROM whatsapp_queue ORDER BY id DESC LIMIT 12")
      .all();

    let installedVersion = "";
    try {
      installedVersion = getInstalledVersion();
    } catch {
      installedVersion = "";
    }

    return {
      enabled: cfg.enabled,
      state: cfg.enabled ? state : "DISABLED",
      qr: qrDataUrl,
      connectedAs,
      lastError,
      pending: counts.PENDING ?? 0,
      failed: counts.FAILED ?? 0,
      sent: counts.SENT ?? 0,
      installedVersion,
      latestVersion: cfg.latestVersion,
      updateAvailable: Boolean(installedVersion && cfg.latestVersion && compareVersions(cfg.latestVersion, installedVersion) > 0),
      browserFound: Boolean(findBrowserFn(cfg.browserPath)),
      recent,
    };
  };

  return {
    start,
    stop,
    setEnabled,
    relink,
    retryFailed,
    enqueue,
    getStatus,
    checkForUpdate: async () => {
      await checkForUpdate(true);
      return getStatus();
    },
    // exposed for tests
    _tick: tick,
  };
};

module.exports = { createWhatsAppService, normalizePhone, compareVersions, findBrowser };
