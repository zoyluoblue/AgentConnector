import { spawn } from "node:child_process";
import { shell } from "electron";
import type { AgentKind, AuthStatus } from "../shared/ipc.js";
import { resolveBin } from "./which.js";

/** Run a command, capturing stdout/stderr. Times out (8s) so a stuck CLI can't hang the UI. */
function run(bin: string, args: string[], cwd: string): Promise<{ out: string; err: string; timedOut: boolean }> {
  return new Promise((resolve) => {
    const c = spawn(bin, args, { cwd, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    let done = false;
    const finish = (timedOut: boolean) => {
      if (done) return;
      done = true;
      clearTimeout(t);
      resolve({ out, err, timedOut });
    };
    const t = setTimeout(() => {
      try {
        c.kill("SIGKILL");
      } catch {
        /* ignore */
      }
      console.error(`[auth] '${args.join(" ")}' timed out after 8s`);
      finish(true);
    }, 8000);
    c.stdout.on("data", (d) => (out += d.toString()));
    c.stderr.on("data", (d) => (err += d.toString()));
    c.on("error", (e) => {
      console.error(`[auth] spawn error for '${args.join(" ")}':`, e.message);
      finish(false);
    });
    c.on("close", () => finish(false));
  });
}

async function claudeStatus(cwd: string): Promise<AuthStatus> {
  const bin = resolveBin("claude");
  if (!bin) {
    console.error("[auth] claude not found on PATH");
    return { connected: false, detail: "未安装" };
  }
  const { out, err, timedOut } = await run(bin, ["auth", "status"], cwd);
  const raw = (out || err).trim();
  console.error(`[auth] claude auth status${timedOut ? " (TIMED OUT)" : ""} -> ${raw.slice(0, 240) || "(empty)"}`);
  const m = raw.match(/\{[\s\S]*\}/); // tolerate any prefix/suffix around the JSON
  if (m) {
    try {
      const j = JSON.parse(m[0]) as { loggedIn?: boolean; email?: string; authMethod?: string };
      if (j.loggedIn) return { connected: true, detail: j.email ?? j.authMethod };
    } catch {
      /* fall through */
    }
  }
  return { connected: false };
}

async function codexStatus(cwd: string): Promise<AuthStatus> {
  const bin = resolveBin("codex");
  if (!bin) {
    console.error("[auth] codex not found on PATH");
    return { connected: false, detail: "未安装" };
  }
  const { out, err, timedOut } = await run(bin, ["login", "status"], cwd);
  const raw = `${out}\n${err}`.trim();
  console.error(`[auth] codex login status${timedOut ? " (TIMED OUT)" : ""} -> ${raw.slice(0, 240) || "(empty)"}`);
  if (/not logged in|no (?:stored )?credentials|please .*log ?in/i.test(raw)) return { connected: false };
  const m = raw.match(/logged in(?: using (.+))?/i);
  if (m) return { connected: true, detail: m[1]?.trim() ?? "已登录" };
  return { connected: false };
}

export function agentStatus(kind: AgentKind, cwd: string): Promise<AuthStatus> {
  if (process.env.STUDIO_FAKE_DISCONNECTED) return Promise.resolve({ connected: false });
  return kind === "claude" ? claudeStatus(cwd) : codexStatus(cwd);
}

/**
 * Run the agent's interactive login (opens a browser OAuth flow). Resolves once
 * login lands (status becomes connected), the login process exits, or a timeout.
 * `onUrl` surfaces any printed URL as a fallback in case the browser didn't open.
 */
export function agentLogin(kind: AgentKind, cwd: string, onUrl: (url: string) => void): Promise<AuthStatus> {
  const bin = resolveBin(kind);
  if (!bin) return Promise.resolve({ connected: false, detail: "未安装" });
  const args = kind === "claude" ? ["auth", "login"] : ["login"];

  return new Promise((resolve) => {
    let done = false;
    const finish = async () => {
      if (done) return;
      done = true;
      clearInterval(poll);
      clearTimeout(timer);
      try {
        child.kill();
      } catch {
        /* already gone */
      }
      resolve(await agentStatus(kind, cwd));
    };

    const child = spawn(bin, args, { cwd, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
    let buf = "";
    const scan = (chunk: string) => {
      buf += chunk;
      const url = buf.match(/https?:\/\/[^\s'"]+/);
      if (url) {
        onUrl(url[0]);
        try {
          void shell.openExternal(url[0]);
        } catch {
          /* ignore */
        }
        buf = "";
      }
    };
    child.stdout?.on("data", (d) => scan(d.toString()));
    child.stderr?.on("data", (d) => scan(d.toString()));
    child.on("close", () => void finish());
    child.on("error", () => void finish());

    const poll = setInterval(() => {
      void agentStatus(kind, cwd).then((st) => {
        if (st.connected) void finish();
      });
    }, 2000);
    const timer = setTimeout(() => void finish(), 180_000);
  });
}
