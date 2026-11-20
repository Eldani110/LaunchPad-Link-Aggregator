#!/usr/bin/env node
import { spawn } from "child_process";
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const electronPath = require("electron");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..", "..");

const env = { ...process.env };
// Unset ELECTRON_RUN_AS_NODE so launching from Electron-based IDEs works reliably
delete env.ELECTRON_RUN_AS_NODE;

const args = process.argv.slice(2);
const electronArgs = [];
let isSmoke = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--dev") {
    env.LAUNCHPAD_DEV_URL = "http://localhost:3000";
  } else if (args[i] === "--smoke") {
    env.LAUNCHPAD_SMOKE_TEST = "1";
    isSmoke = true;
  }
}

// On KDE Plasma Wayland, start on XWayland directly for instant KWin native GPU blur
const isKdeWayland =
  process.platform === "linux" &&
  (process.env.XDG_CURRENT_DESKTOP || "").toUpperCase().includes("KDE") &&
  Boolean(process.env.DISPLAY) &&
  process.env.XDG_SESSION_TYPE === "wayland";

if (!isSmoke && isKdeWayland) {
  env.ELECTRON_OZONE_PLATFORM_HINT = "x11";
  env.LAUNCHPAD_X11_RELAUNCHED = "1";
  electronArgs.push("--ozone-platform=x11");
}

electronArgs.push(".");

const child = spawn(electronPath, electronArgs, {
  cwd: ROOT,
  env,
  stdio: "inherit",
});

child.on("close", (code) => {
  process.exit(code ?? 0);
});

