import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { log } from "../util/log.js";
import { cleanupTmpDir, createRunTmpDir } from "../util/tmp.js";

export interface ClaudeRunOptions {
  prompt: string;
  cwd: string;
  /** JSON Schema object -> `--json-schema` for structured output. */
  schema?: unknown;
  model?: string;
  /** Disallow edit tools (default true) so plan/review can't mutate the repo. */
  readOnly?: boolean;
  timeoutMs?: number;
  bin?: string;
  signal?: AbortSignal;
}

export interface ClaudeRunResult {
  ok: boolean;
  text: string; // the envelope's `result` text
  structured?: unknown; // parsed structured output (when a schema was used)
  sessionId?: string;
  costUsd?: number;
  raw: string;
  error?: string;
}

/** Parse the `claude -p --output-format json` envelope. Pure + defensive (unit-tested). */
export function parseClaudeEnvelope(out: string, err: string, code: number | null): ClaudeRunResult {
  let env: Record<string, unknown>;
  try {
    env = JSON.parse(out) as Record<string, unknown>;
  } catch {
    return { ok: false, text: "", raw: out, error: `claude: non-JSON output (exit ${code}): ${(err || out).slice(0, 300)}` };
  }
  const isError = env["is_error"] === true || env["subtype"] === "error" || env["type"] === "error";
  const resultField = env["result"];
  const text = typeof resultField === "string" ? resultField : resultField !== undefined ? JSON.stringify(resultField) : "";

  let structured: unknown;
  if (resultField !== undefined && resultField !== null) {
    if (typeof resultField === "object") structured = resultField;
    else if (typeof resultField === "string") {
      try {
        structured = JSON.parse(resultField);
      } catch {
        /* result is plain text, not structured */
      }
    }
  }

  return {
    ok: !isError && code === 0,
    text,
    structured,
    sessionId: typeof env["session_id"] === "string" ? (env["session_id"] as string) : undefined,
    costUsd: typeof env["total_cost_usd"] === "number" ? (env["total_cost_usd"] as number) : undefined,
    raw: out,
    error: isError ? String(env["error"] ?? text ?? "claude error") : undefined,
  };
}

/** Run `claude -p` headlessly with optional schema + read-only enforcement. */
export async function runClaude(opts: ClaudeRunOptions): Promise<ClaudeRunResult> {
  const bin = opts.bin || process.env.AGENTCONNECTOR_CLAUDE_BIN || "claude";
  const tmpDir = createRunTmpDir();
  const argv = ["-p", "--output-format", "json"];

  if (opts.schema !== undefined) {
    const schemaFile = join(tmpDir, "schema.json");
    writeFileSync(schemaFile, JSON.stringify(opts.schema), "utf8");
    argv.push("--json-schema", schemaFile);
  }
  if (opts.model) argv.push("--model", opts.model);
  // Keep edit tools last is unnecessary (we pass the prompt via stdin), but the
  // variadic --disallowedTools must not be followed by a positional prompt.
  if (opts.readOnly !== false) argv.push("--disallowedTools", "Edit", "Write", "NotebookEdit");
  argv.push("--add-dir", opts.cwd);

  return new Promise<ClaudeRunResult>((resolve) => {
    const child = spawn(bin, argv, { cwd: opts.cwd, stdio: ["pipe", "pipe", "pipe"], env: process.env });
    let out = "";
    let err = "";
    let settled = false;
    const finish = (r: ClaudeRunResult) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      cleanupTmpDir(tmpDir);
      resolve(r);
    };
    const timer = opts.timeoutMs
      ? setTimeout(() => {
          try {
            child.kill("SIGKILL");
          } catch {
            /* ignore */
          }
          finish({ ok: false, text: "", raw: out, error: `claude timed out after ${opts.timeoutMs}ms` });
        }, opts.timeoutMs)
      : undefined;

    opts.signal?.addEventListener("abort", () => {
      try {
        child.kill("SIGKILL");
      } catch {
        /* ignore */
      }
      finish({ ok: false, text: "", raw: out, error: "aborted" });
    });

    child.stdout?.on("data", (d) => (out += d));
    child.stderr?.on("data", (d) => (err += d));
    child.on("error", (e) => {
      log.error("claude spawn error", String(e));
      finish({ ok: false, text: "", raw: out, error: String(e) });
    });
    child.on("close", (code) => finish(parseClaudeEnvelope(out, err, code)));

    if (child.stdin) {
      child.stdin.write(opts.prompt);
      child.stdin.end();
    }
  });
}
