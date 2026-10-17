/**
 * Fix for whatsapp-web.js 1.34.7: since WhatsApp Web's September 2026 update, sending an IMAGE fails with
 * "Data passed to getter must include an id property (it's how we memoize) but got undefined".
 * Cause: the media model carries a private "__x_id" that overwrites the outgoing message's id.
 * Fix (same as the open upstream fix, wwebjs issue #201922): drop "__x_id" before the message is built.
 *
 * Safe to run many times. Runs automatically after `npm install` (see "postinstall" in package.json).
 */
const fs = require("node:fs");
const path = require("node:path");

const MARK = "QDC-PATCH";
const file = path.join(__dirname, "..", "node_modules", "whatsapp-web.js", "src", "util", "Injected", "Utils.js");

try {
  if (!fs.existsSync(file)) {
    console.log("[patch-whatsapp] whatsapp-web.js not installed yet, nothing to patch.");
    process.exit(0);
  }
  let source = fs.readFileSync(file, "utf8");
  if (source.includes(MARK)) {
    console.log("[patch-whatsapp] already patched.");
    process.exit(0);
  }

  const before = /(\n[ \t]*)(const message = \{\s*\.\.\.options,\s*id: newMsgKey,)/;
  if (!before.test(source)) {
    console.log("[patch-whatsapp] WARNING: expected code not found (library version changed?). Patch NOT applied.");
    process.exit(0);
  }
  source = source.replace(before, (_all, indent, start) =>
    `${indent}// ${MARK}: the media model's private id must not replace the outgoing message id${indent}if (mediaOptions && typeof mediaOptions === 'object') { delete mediaOptions.__x_id; }${indent}${start}`,
  );

  const after = /(\n[ \t]*)(\/\/ Bot's won't reply if canonicalUrl is set \(linking\))/;
  if (after.test(source)) {
    source = source.replace(after, (_all, indent, comment) => `${indent}delete message.__x_id; // ${MARK}${indent}${comment}`);
  }

  fs.writeFileSync(file, source);
  console.log("[patch-whatsapp] patched whatsapp-web.js image sending.");
} catch (error) {
  // never break npm install because of this
  console.log("[patch-whatsapp] could not patch:", error.message);
}
