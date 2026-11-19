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
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--dev") {
    env.LAUNCHPAD_DEV_URL = "http://localhost:3000";
  } else if (args[i] === "--smoke") {
    env.LAUNCHPAD_SMOKE_TEST = "1";
  }
}

const child = spawn(electronPath, ["."], {
  cwd: ROOT,
  env,
  stdio: "inherit",
});

child.on("close", (code) => {
  process.exit(code ?? 0);
});

