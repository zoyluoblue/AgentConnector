// Core logger: writes to STDERR (never stdout — that's the MCP transport) and,
// when a log file is configured, also appends there for post-hoc debugging.
//
// Env: AGENTCONNECTOR_LOG_LEVEL (debug|info|warn|error, default info)
//      AGENTCONNECTOR_LOG_JSON  (1|true -> structured JSON lines)
//      AGENTCONNECTOR_LOG_FILE  (path -> also append logs to this file)
import { appendFileSync, mkdirSync, renameSync, statSync } from "node:fs";
import { dirname } from "node:path";

type Level = "debug" | "info" | "warn" | "error";
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

let threshold = ORDER[(process.env.AGENTCONNECTOR_LOG_LEVEL as Level) || "info"] ?? ORDER.info;
const asJson = process.env.AGENTCONNECTOR_LOG_JSON === "1" || process.env.AGENTCONNECTOR_LOG_JSON === "true";
let logFile: string | undefined = process.env.AGENTCONNECTOR_LOG_FILE || undefined;

/** Direct core logs to a file (in addition to stderr). Rotates once past 5 MB. */
export function setLogFile(path: string): void {
  try {
    mkdirSync(dirname(path), { recursive: true });
    try {
      if (statSync(path).size > 5 * 1024 * 1024) renameSync(path, `${path}.1`);
    } catch {
      /* no existing file */
    }
    logFile = path;
  } catch {
    /* best-effort: file logging is optional */
  }
}

export function getLogFile(): string | undefined {
  return logFile;
}

export function setLogLevel(level: Level): void {
  threshold = ORDER[level] ?? threshold;
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return "[unserializable]";
  }
}

function emit(level: Level, msg: string, extra?: unknown): void {
  if (ORDER[level] < threshold) return;
  let line: string;
  if (asJson) {
    line = safeJson({ ts: new Date().toISOString(), level, msg, extra });
  } else {
    line = `[${new Date().toISOString()}] [agentconnector] [${level}] ${msg}`;
    if (extra !== undefined) line += " " + (typeof extra === "string" ? extra : safeJson(extra));
  }
  process.stderr.write(line + "\n");
  if (logFile) {
    try {
      appendFileSync(logFile, line + "\n");
    } catch {
      /* best-effort */
    }
  }
}

export const log = {
  debug: (msg: string, extra?: unknown) => emit("debug", msg, extra),
  info: (msg: string, extra?: unknown) => emit("info", msg, extra),
  warn: (msg: string, extra?: unknown) => emit("warn", msg, extra),
  error: (msg: string, extra?: unknown) => emit("error", msg, extra),
};
