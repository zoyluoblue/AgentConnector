import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";

// Checked even if the GUI process PATH is incomplete.
const FALLBACK_DIRS = ["/opt/homebrew/bin", "/usr/local/bin", `${homedir()}/.local/bin`];

/** Resolve a bare command to an absolute executable path (GUI PATH is unreliable). */
export function resolveBin(cmd: string): string | null {
  if (cmd.includes("/")) return existsSync(cmd) ? cmd : null;
  for (const d of [...(process.env.PATH ?? "").split(delimiter), ...FALLBACK_DIRS]) {
    if (d && existsSync(join(d, cmd))) return join(d, cmd);
  }
  return null;
}
