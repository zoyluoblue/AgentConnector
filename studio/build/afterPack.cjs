const { execSync } = require("node:child_process");
const { join } = require("node:path");

// Ad-hoc codesign the packed .app so a self-built Apple-Silicon build can launch
// (first open: right-click > Open). electron-builder skips signing (identity: null).
exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") return;
  const app = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  try {
    execSync(`codesign --deep --force --sign - "${app}"`, { stdio: "inherit" });
    console.log("[afterPack] ad-hoc signed:", app);
  } catch (e) {
    console.warn("[afterPack] ad-hoc sign failed:", e.message);
  }
};
