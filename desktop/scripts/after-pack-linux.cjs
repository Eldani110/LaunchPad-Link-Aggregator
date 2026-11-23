const fs = require("fs");
const path = require("path");

/**
 * electron-builder afterPack hook for Linux (.deb and AppImage):
 * Wraps the Electron binary with a fast POSIX shell trigger that signals
 * an already-running LaunchPad instance via SIGUSR2 in <5ms instead of
 * cold-starting a second Chromium/Electron process.
 */
exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "linux") return;

  const execName = context.packager.executableName || "launchpad-link-aggregator";
  const binPath = path.join(context.appOutDir, execName);
  const realBinPath = path.join(context.appOutDir, `${execName}.bin`);
  const triggerSrc = path.resolve(__dirname, "launchpad-trigger.sh");

  if (!fs.existsSync(binPath)) {
    throw new Error(`afterPack: expected Linux binary not found at ${binPath}`);
  }
  if (!fs.existsSync(triggerSrc)) {
    throw new Error(`afterPack: trigger script not found at ${triggerSrc}`);
  }

  fs.renameSync(binPath, realBinPath);
  fs.copyFileSync(triggerSrc, binPath);
  fs.chmodSync(binPath, 0o755);
  fs.chmodSync(realBinPath, 0o755);
};

