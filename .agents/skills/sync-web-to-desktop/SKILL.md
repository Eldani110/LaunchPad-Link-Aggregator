---
name: sync-web-to-desktop
description: >-
  Use this skill whenever any change is made to the LaunchPad web application
  (UI components, pages, context, routing, styles, assets, dependencies, or Firebase
  services) so the cross-platform Electron desktop application (Windows, Ubuntu/Linux,
  macOS) stays 100% synchronized with a fully local interface and Firebase database data.
---

# Sync Web Changes to Desktop App

LaunchPad shares a single React + Vite + TypeScript UI codebase between the **Web app** and the **Desktop app** (Windows, Ubuntu/Linux, macOS). The desktop shell ([desktop/main.cjs](../../../../desktop/main.cjs)) serves the compiled local `dist/` bundle via the privileged `app://launchpad` protocol while loading all user data live from Firebase Auth + Cloud Firestore.

Whenever the web app is modified, follow this workflow so the desktop version reflects every change without regressions.

## Mandatory Compatibility Rules

Before syncing, verify that your web changes preserve these invariants:

1. **100% Local Interface**: Never add external UI CDNs (such as `cdn.tailwindcss.com`, Google Fonts links, or external JS libraries) to [index.html](../../../../index.html). All CSS must compile locally through Tailwind CSS in [index.css](../../../../index.css) and `npm run build`.
2. **Relative Local Asset Paths**: Keep `base: './'` in [vite.config.ts](../../../../vite.config.ts) so scripts and stylesheets load cleanly under both web hosting and `app://launchpad`.
3. **Hash Routing**: Keep `HashRouter` in [App.tsx](../../../../App.tsx). Do not switch to `BrowserRouter`.
4. **External Links**: Open user bookmarks/external URLs via `openExternalLink(url)` from [services/platform.ts](../../../../services/platform.ts) instead of raw `window.open()`, so links open in the OS default browser on Desktop.
5. **Firebase Database Data**: Keep Firebase Auth and Firestore calls in [services/firebase.ts](../../../../services/firebase.ts) and [services/firebaseService.ts](../../../../services/firebaseService.ts) compatible with both web origins and `app://launchpad`. Do not rely on OAuth popup flows that break on custom schemes without updating Electron handling.
6. **Desktop Shell / IPC Parity**: If a web feature needs a native desktop capability (new window shortcuts, tray, deep links, custom file dialogs, version display, or native titlebar spacing), update [desktop/preload.cjs](../../../../desktop/preload.cjs), [desktop/main.cjs](../../../../desktop/main.cjs), and [services/platform.ts](../../../../services/platform.ts) together.

## Sync Procedure

1. **Review Desktop Impact**:
   - Check if the web change added new routes, keyboard shortcuts, external URL handlers, environment variables, or icons.
   - If the app icon or branding changed, update [desktop/scripts/generate-icons.py](../../../../desktop/scripts/generate-icons.py) and re-run it to regenerate `icon.png`, `icon.ico`, and `icon.icns`.
   - If preparing a new release version, update `"version"` in [package.json](../../../../package.json) (both web and desktop installers read it).

2. **Run the Automated Sync & Audit Script**:
   ```bash
   npm run desktop:sync
   ```
   This runs [scripts/sync-desktop.mjs](./scripts/sync-desktop.mjs), which:
   - Audits `index.html`, `vite.config.ts`, `App.tsx`, `pages/`, `components/`, and `desktop/` for desktop compatibility and 100% local UI compliance.
   - Runs `npx tsc --noEmit`.
   - Rebuilds the shared local `dist/` bundle via `npm run build`.
   - Verifies `dist/index.html` uses local `./assets/*.css` and `./assets/*.js` with zero external UI CDNs.

3. **Run the Electron Smoke Test (when UI/routing/main-process changed)**:
   ```bash
   node .agents/skills/sync-web-to-desktop/scripts/sync-desktop.mjs --smoke
   ```
   Confirm `SMOKE_TEST_RESULT` prints `origin: "app://launchpad"`, `hasDesktopBridge: true`, `hasUpdaterBridge: true`, `rootChildCount > 0`, `stylesheetCount > 0`, and `externalScripts: []`.

4. **Rebuild & Publish Desktop Updates via GitHub Releases**:
   - Local OS packaging:
     - Current OS: `npm run desktop:build`
     - Ubuntu / Linux (`.deb`, `.AppImage`, `latest-linux.yml`): `npm run desktop:build:linux`
     - Windows (`.exe` NSIS + portable, `latest.yml`): `npm run desktop:build:win`
     - macOS (`.dmg`, `.zip`, `latest-mac.yml`): `npm run desktop:build:mac`
   - **Publish a new update to all Desktop users (Windows, Ubuntu, macOS) via GitHub Releases**:
     1. Bump `"version"` in [package.json](../../../../package.json) (e.g. `npm version patch` / `minor` / `major`).
     2. Commit and push the tag `vX.Y.Z` (`git push origin main --tags`).
     3. [.github/workflows/build-desktop.yml](../../../../.github/workflows/build-desktop.yml) automatically builds Windows, Ubuntu, and macOS installers plus `latest*.yml` / `*.blockmap` metadata and publishes them to **GitHub Releases**, where installed desktop apps (`desktop/updater.cjs`) automatically detect and install the update.

