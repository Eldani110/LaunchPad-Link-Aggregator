# LaunchPad Web + Desktop Synchronization Policy

This repository contains both the **LaunchPad Web App** and the **LaunchPad Desktop App** (Windows, Ubuntu/Linux, macOS) powered by Electron with a 100% local UI and live Firebase Firestore data.

## Mandatory Rule When Modifying the Web App

Whenever you make ANY change to the web application (`App.tsx`, `pages/`, `components/`, `context/`, `services/`, `types.ts`, `index.html`, `index.css`, `vite.config.ts`, or `package.json`):

1. You MUST read and follow the workspace skill `.agents/skills/sync-web-to-desktop/SKILL.md`.
2. Never reintroduce external UI CDNs (such as `cdn.tailwindcss.com`) into `index.html`; all interface assets must remain 100% local.
3. Keep `base: './'` in `vite.config.ts` and `HashRouter` in `App.tsx`, and use `openExternalLink()` from `services/platform.ts` for external URLs.
4. Always run `npm run desktop:sync` before finishing so the desktop app bundle (`dist/`), types, and compatibility checks are updated and verified together with the web app.
5. If the user asks to rebuild or release installers, also run `npm run desktop:build` (or the target OS build script) after syncing.

