const { join } = require("node:path");

// The Chromium that WhatsApp uses is downloaded by `npm install` into ./.cache/puppeteer
// and copied into the installer (see "extraResources" in electron-builder.json).
module.exports = {
  cacheDirectory: join(__dirname, ".cache", "puppeteer"),
  "chrome-headless-shell": { skipDownload: true }, // not needed, saves ~100 MB
};
