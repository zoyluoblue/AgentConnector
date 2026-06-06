// User preferences (proxy + theme), persisted to userData/settings.json.
// The proxy choice is applied to every claude/codex child process env.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { AppSettings } from "../shared/ipc.js";
import { log } from "./log.js";

const DEFAULTS: AppSettings = { proxyMode: "system", proxyUrl: "", theme: "system" };
const PROXY_KEYS = ["HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy", "ALL_PROXY", "all_proxy"];

let file = "";
let current: AppSettings = { ...DEFAULTS };

export function initSettings(path: string): void {
  file = path;
  try {
    if (existsSync(file)) current = { ...DEFAULTS, ...(JSON.parse(readFileSync(file, "utf8")) as Partial<AppSettings>) };
  } catch (e) {
    log("settings.load.error", { err: String(e) });
  }
  log("settings.loaded", { proxyMode: current.proxyMode, theme: current.theme, hasUrl: !!current.proxyUrl });
}

export function getSettings(): AppSettings {
  return current;
}

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  current = { ...current, ...patch };
  try {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(current, null, 2));
  } catch (e) {
    log("settings.save.error", { err: String(e) });
  }
  log("settings.update", { proxyMode: current.proxyMode, theme: current.theme, hasUrl: !!current.proxyUrl });
  return current;
}

/** Apply the user's proxy choice onto a spawn env (mutates + returns it). */
export function applyProxy(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  if (current.proxyMode === "none") {
    for (const k of PROXY_KEYS) delete env[k];
  } else if (current.proxyMode === "custom" && current.proxyUrl.trim()) {
    const u = current.proxyUrl.trim();
    env.HTTP_PROXY = u;
    env.HTTPS_PROXY = u;
    env.http_proxy = u;
    env.https_proxy = u;
  }
  // "system" → leave whatever the OS/shell provided untouched
  return env;
}

/** The proxy host:port that requests will actually use (for error hints), or null. */
export function effectiveProxy(): string | null {
  if (current.proxyMode === "none") return null;
  const p =
    current.proxyMode === "custom"
      ? current.proxyUrl.trim() || undefined
      : process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
  return p ? p.replace(/^https?:\/\//, "").replace(/\/$/, "") : null;
}
