# WhatsApp Auto Messages

Quetta Dry Cleaners can send WhatsApp messages by itself:

- **Order saved** -> the receipt image + a short message goes to the customer.
- **Order status changed to READY** -> a "your order is ready" message goes to the customer (once per order).
- **Order status changed to DELIVERED** -> a thank-you message with a Google review link goes to the customer (once per order). The link is `GOOGLE_REVIEW_LINK` in `src/whatsappMessages.ts`.

The customer's number is taken from the **Phone** field of the order (`0300 1234567`, `03001234567` and `+92 300 1234567` all work).

## First-time setup (shop PC)

1. Nothing to install: the installer already contains the browser (Chromium) that WhatsApp uses in the background. If it is ever missing, the app falls back to Google Chrome / Microsoft Edge on the PC.
2. Install WhatsApp Business on the shop phone (use a separate, dedicated number).
3. Open the app -> **Settings** -> **WhatsApp Auto Messages** -> **Turn ON**.
4. A QR code appears. On the phone: WhatsApp Business -> Settings -> **Linked Devices** -> **Link a Device** -> scan it.
5. Status shows **Connected**. Done. You do not need to scan again after restarts.

The feature is **OFF by default**. Orders created while it is OFF are never sent later.

## Good to know

- Saving an order never waits for WhatsApp. If internet or WhatsApp is down, messages wait in a queue and go automatically when it is back (unsent messages older than 72 hours are dropped).
- Each message type is sent only once per order.
- Messages are sent a few seconds apart on purpose (safer for the number).
- Only send receipts and ready alerts. Do not use this number for promotions or bulk messages: that is what gets numbers banned.
- Failed messages (for example a number that is not on WhatsApp) are listed in Settings. **Retry failed** tries them again.
- To use another phone/number: Settings -> **Unlink / Change number**, then scan the new QR.
- WhatsApp login data is stored in the Windows user data folder (`%APPDATA%\Quetta Dry Cleaners\whatsapp-session`). The message queue is stored in the same SQLite database as your other data (separate table), so Backup/Restore covers it.

## Image sending fix (September 2026)

Since WhatsApp Web's update on 17 Sep 2026, `whatsapp-web.js` 1.34.7 cannot send images by itself (error: "Data passed to getter must include an id property"). The project includes a small fix: `scripts/patch-whatsapp.cjs`, which runs automatically after `npm install`. If you ever see that error again, run `node scripts/patch-whatsapp.cjs`, then rebuild the installer.
Safety net: if an image still fails 3 times, the customer gets the same confirmation as a normal text message, so nobody is left without a message.

## The WhatsApp library version is locked

The app uses `whatsapp-web.js`, an unofficial library, fixed at version **1.34.7** in `package.json`. It never updates by itself.
Once a day (when internet is available) the app checks whether a newer version exists and shows a notice in Settings.

**You do not need to update while messages are going out normally.**
Update only if messages stop working (Settings shows errors and "Waiting" keeps growing):

1. Open a terminal in the project folder.
2. `npm install whatsapp-web.js@<new version> --save-exact` (the image fix is re-applied automatically; it does nothing if the new version already fixes it)
3. `npm run build`
4. `npx electron-builder --config electron-builder.json --win`
5. Take a **Backup** in the old app, then run the new `release/Quetta_Dry_Cleaners_Setup.exe`.

If the shop PC is a different machine from the build PC, nothing else is needed: the installer contains the library and the browser.

## Building the installer (browser download)

`npm install` downloads Chromium (about 150 MB, needs internet) into `.cache/puppeteer`, and the installer copies it. The installer will be about 150 MB bigger than before.
If `.cache/puppeteer/chrome` is missing before you build, run `npx puppeteer browsers install chrome` first.
