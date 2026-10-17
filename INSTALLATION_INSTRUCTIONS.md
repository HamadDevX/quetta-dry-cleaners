# Windows Installation Instructions

## Prerequisites (Build Machine)

- Windows 10/11
- Node.js 20+
- npm

## Setup

1. Copy your official logo files to `assets/`:
   - `Quetta_Dry_Cleaners_Logo.png`
   - `Quetta_Dry_Cleaners_Logo.ico`
2. Open terminal in project folder.
3. Run `npm install`.

## Build Desktop Installer

1. Run `npm run build`.
2. Run `npx electron-builder --config electron-builder.json --win`.
3. Installer output is generated in `release/Quetta_Dry_Cleaners_Setup.exe`.

## Install on Business Laptop

1. Double-click `Quetta_Dry_Cleaners_Setup.exe`.
2. Follow one-click installation.
3. Launch from Desktop shortcut or Start Menu shortcut:
   - Quetta Dry Cleaners

## Data Storage

- SQLite database is stored in Windows AppData user directory.
- Data persists through restart and app updates.
- Use in-app Backup and Restore in Settings.

## WhatsApp Auto Messages

- `npm install` downloads a Chromium browser (about 150 MB) into `.cache/puppeteer`; it is packed into the installer, so the shop PC needs nothing extra. If it is missing, run `npx puppeteer browsers install chrome` before building.
- Setup, usage and updating: see `WHATSAPP_SETUP.md`.
