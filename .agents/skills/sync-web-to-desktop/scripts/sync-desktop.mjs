#!/usr/bin/env node
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..", "..", "..", "..");

const args = new Set(process.argv.slice(2));
const runSmoke = args.has("--smoke");
const runPackage = args.has("--package");
const targetPlatform = [...args].find((a) => a.startsWith("--target="))?.split("=")[1] || null;

const errors = [];
const warnings = [];

function logStep(msg) {
  console.log(`\n[sync-web-to-desktop] ${msg}`);
}

function run(cmd, opts = {}) {
  console.log(`  $ ${cmd}`);
  execSync(cmd, { cwd: ROOT, stdio: "inherit", ...opts });
}

function walkFiles(dir, exts) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(full, exts));
    } else if (exts.some((ext) => entry.name.endsWith(ext))) {
      results.push(full);
    }
  }
  return results;
}

// 1. Validate local-only UI & desktop compatibility before building
logStep("1/4 Auditing web codebase for 100% local desktop compatibility...");

const indexHtmlPath = path.join(ROOT, "index.html");
if (!fs.existsSync(indexHtmlPath)) {
  errors.push("Missing index.html at project root.");
} else {
  const html = fs.readFileSync(indexHtmlPath, "utf8");
  const externalTagRegex = /<(script|link)\b[^>]*(src|href)=["']https?:\/\/[^"']+["'][^>]*>/gi;
  const externalTags = html.match(externalTagRegex) || [];
  if (externalTags.length > 0) {
    errors.push(
      `index.html contains external UI CDN tags (violates 100% local UI rule): ${externalTags.join(", ")}`
    );
  }
}

const viteConfigPath = path.join(ROOT, "vite.config.ts");
if (fs.existsSync(viteConfigPath)) {
  const viteConfig = fs.readFileSync(viteConfigPath, "utf8");
  if (!/base\s*:\s*['"]\.\/['"]/.test(viteConfig)) {
    errors.push("vite.config.ts must define `base: './'` so local assets resolve inside Electron.");
  }
}

const appTsxPath = path.join(ROOT, "App.tsx");
if (fs.existsSync(appTsxPath)) {
  const appTsx = fs.readFileSync(appTsxPath, "utf8");
  if (appTsx.includes("BrowserRouter")) {
    errors.push("App.tsx uses BrowserRouter. Use HashRouter to keep local desktop routing working.");
  }
}

// Check for direct window.open usage in pages/components
const uiFiles = [
  ...walkFiles(path.join(ROOT, "pages"), [".ts", ".tsx"]),
  ...walkFiles(path.join(ROOT, "components"), [".ts", ".tsx"]),
];
for (const file of uiFiles) {
  const content = fs.readFileSync(file, "utf8");
  if (content.includes("window.open(")) {
    const rel = path.relative(ROOT, file);
    warnings.push(
      `${rel} calls window.open() directly. Prefer openExternalLink() from services/platform.ts for native desktop browser handling.`
    );
  }
}

// Verify required desktop files and cross-platform icons exist
const requiredDesktopFiles = [
  "desktop/main.cjs",
  "desktop/preload.cjs",
  "desktop/updater.cjs",
  "desktop/launcher.cjs",
  "desktop/electron-builder.yml",
  "desktop/assets/icon.png",
  "desktop/assets/icon.ico",
  "desktop/assets/icon.icns",
  "services/platform.ts",
  "components/DesktopUpdateBanner.tsx",
  "components/DesktopUpdatesSection.tsx",
];
for (const relPath of requiredDesktopFiles) {
  if (!fs.existsSync(path.join(ROOT, relPath))) {
    errors.push(`Missing required desktop file: ${relPath}`);
  }
}

const builderCfgPath = path.join(ROOT, "desktop", "electron-builder.yml");
if (fs.existsSync(builderCfgPath)) {
  const builderCfg = fs.readFileSync(builderCfgPath, "utf8");
  if (!/provider:\s*github/.test(builderCfg)) {
    errors.push("desktop/electron-builder.yml must configure GitHub Releases under `publish:` for auto-updates.");
  }
}

if (warnings.length > 0) {
  console.warn("\nWarnings:");
  for (const w of warnings) console.warn(`  - ${w}`);
}

if (errors.length > 0) {
  console.error("\nDesktop compatibility check FAILED:");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log("  OK: Web codebase is compatible with local desktop shell.");

// 2. Type-check
logStep("2/4 Running TypeScript check...");
run("npx tsc --noEmit");

// 3. Build unified local UI bundle into dist/
logStep("3/4 Building unified local UI bundle (Web + Desktop)...");
run("npm run build");

// 4. Verify compiled dist/ output is strictly local
logStep("4/4 Verifying compiled dist/ bundle has local CSS/JS and zero external UI CDNs...");
const distHtmlPath = path.join(ROOT, "dist", "index.html");
if (!fs.existsSync(distHtmlPath)) {
  console.error("Build failed: dist/index.html was not generated.");
  process.exit(1);
}
const distHtml = fs.readFileSync(distHtmlPath, "utf8");
if (/https?:\/\/cdn\.tailwindcss\.com/i.test(distHtml)) {
  console.error("dist/index.html still references cdn.tailwindcss.com!");
  process.exit(1);
}
if (!/\.\/assets\/.+\.css/i.test(distHtml)) {
  console.error("dist/index.html is missing a local compiled CSS asset (./assets/*.css).");
  process.exit(1);
}
if (!/\.\/assets\/.+\.js/i.test(distHtml)) {
  console.error("dist/index.html is missing a local compiled JS asset (./assets/*.js).");
  process.exit(1);
}
console.log("  OK: dist/index.html references local CSS and JS assets only.");

// Optional: Headless Electron smoke test
if (runSmoke) {
  logStep("Running Electron local UI smoke test...");
  run("node desktop/scripts/launch-electron.mjs --smoke");
}

// Optional: Package native desktop installer
if (runPackage) {
  const flag =
    targetPlatform === "linux"
      ? "--linux"
      : targetPlatform === "win"
      ? "--win"
      : targetPlatform === "mac"
      ? "--mac"
      : "";
  logStep(`Packaging desktop application (${targetPlatform || "current OS"})...`);
  run(`npx electron-builder ${flag} --config desktop/electron-builder.yml`.trim());
}

console.log("\n[sync-web-to-desktop] Synchronization completed successfully.");
