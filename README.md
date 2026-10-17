# Quetta Dry Cleaners Desktop Software

Professional offline laundry and dry-cleaning management software branded for:

- QUETTA DRY CLEANERS
- WASH - DRY - PRESS

This project is implemented as an Electron + React desktop application with a local SQLite database.

## Core Features

- Premium dark desktop UI with sidebar navigation
- Dashboard with today's stats, status overview, and quick actions
- New Order workflow with automatic rate loading and order calculations
- Orders management with search, status updates, and receipt print/reprint
- Customer management and customer lookup
- Payment management with payment history entries
- Rate List (services) management with enable/disable and rate edits
- Expense management with daily and monthly totals
- Reports section with service-wise and net sales summary
- Settings for business profile, receipt options, and app options
- SQLite local database in Windows AppData (desktop mode)
- Backup and restore dialogs in desktop mode

## Logo Branding Requirement

Add your official files in `assets/`:

- `Quetta_Dry_Cleaners_Logo.png`
- `Quetta_Dry_Cleaners_Logo.ico`

The software uses the same logo path for the app branding, header, and receipt rendering.

## Local Database Location

In EXE mode, database path is:

- `%APPDATA%/<AppName>/data/quetta_dry_cleaners.db`

This location survives app restarts and software updates.

## Development

1. Install dependencies:
`npm install`

2. Run web UI preview:
`npm run dev`

3. Build frontend assets:
`npm run build`

4. Run Electron desktop app (after build):
`npx electron electron/main.cjs`

## Build Windows Installer

Run these commands on Windows:

1. `npm install`
2. `npm run build`
3. `npx electron-builder --config electron-builder.json --win`

Generated installer:

- `release/Quetta_Dry_Cleaners_Setup.exe`

## User Manual

See `USER_MANUAL.md` for staff operations.