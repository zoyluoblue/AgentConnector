// node-pty ships its macOS `spawn-helper` via a prebuilt package, and npm
// extraction can drop the executable bit — which makes every PTY spawn fail with
// "posix_spawnp failed". Re-assert +x after install so the app works out of the box.
import { chmodSync } from "node:fs";

for (const arch of ["darwin-arm64", "darwin-x64"]) {
  const helper = new URL(`../node_modules/node-pty/prebuilds/${arch}/spawn-helper`, import.meta.url);
  try {
    chmodSync(helper, 0o755);
    console.log(`[fix-pty-perms] chmod +x ${arch}/spawn-helper`);
  } catch {
    /* not present for this arch — ignore */
  }
}
