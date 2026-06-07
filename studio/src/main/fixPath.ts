import { execFileSync } from "node:child_process";
import { homedir } from "node:os";

/**
 * macOS/Linux GUI apps are launched without the user's shell PATH, so CLIs
 * installed via Homebrew (e.g. /opt/homebrew/bin/claude, /opt/homebrew/bin/codex)
 * aren't found — the app would fail to spawn them. This augments process.env.PATH
 * with the login shell's PATH plus common locations. Call once at startup, before
 * anything resolves a binary.
 */
export function fixPath(): void {
  if (process.platform === "win32") return;

  const common = [
    "/opt/homebrew/bin",
    "/opt/homebrew/sbin",
    "/usr/local/bin",
    `${homedir()}/.local/bin`,
    "/usr/bin",
    "/bin",
    "/usr/sbin",
    "/sbin",
  ];

  let shellPath = "";
  try {
    const shell = process.env.SHELL || "/bin/zsh";
    shellPath = execFileSync(shell, ["-lc", 'echo -n "$PATH"'], {
      encoding: "utf8",
      timeout: 5000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    /* fall back to the common paths below */
  }

  const merged = new Set<string>();
  for (const p of [...shellPath.split(":"), ...(process.env.PATH ?? "").split(":"), ...common]) {
    if (p) merged.add(p);
  }
  process.env.PATH = [...merged].join(":");
}
