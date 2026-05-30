// Phase 2 integration smoke: worktree isolation + agent_apply, and agent_resume.
// Spawns the built server and drives real Codex runs. Run: node scripts/smoke2.mjs
import { spawn, execSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const POLL_MS = 1500;
const TASK_TIMEOUT_MS = 180_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function makeScratchRepo() {
  const dir = mkdtempSync(join(tmpdir(), "ac-smoke2-"));
  execSync("git init -q && git config user.email t@t && git config user.name t", { cwd: dir });
  execSync("echo seed > seed.txt && git add -A && git commit -qm seed", { cwd: dir });
  return dir;
}

function startServer() {
  const child = spawn("node", [join(ROOT, "dist/index.js")], { cwd: ROOT, stdio: ["pipe", "pipe", "pipe"], env: process.env });
  child.stderr.on("data", (d) => process.stderr.write(`[server] ${d}`));
  const pending = new Map();
  let buf = "";
  child.stdout.on("data", (d) => {
    buf += d.toString();
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      let m;
      try { m = JSON.parse(line); } catch { continue; }
      if (m.id !== undefined && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    }
  });
  let id = 1;
  const rpc = (method, params) => new Promise((res) => { const i = id++; pending.set(i, res); child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: i, method, params }) + "\n"); });
  const notify = (method, params) => child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
  return { child, rpc, notify };
}

const payload = (res) => JSON.parse(res?.result?.content?.[0]?.text);
const call = async (rpc, name, args) => payload(await rpc("tools/call", { name, arguments: args }));

async function poll(rpc, taskId) {
  const deadline = Date.now() + TASK_TIMEOUT_MS;
  let st;
  while (Date.now() < deadline) {
    st = await call(rpc, "agent_status", { taskId });
    if (st.state !== "running" && st.state !== "queued") return st;
    await sleep(POLL_MS);
  }
  return st;
}

async function main() {
  const scratch = makeScratchRepo();
  const { child, rpc, notify } = startServer();
  let fail = 0;
  const check = (c, label, extra) => { console.log(`${c ? "✓" : "✗"} ${label}${extra ? ` — ${extra}` : ""}`); if (!c) fail++; };

  try {
    await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "smoke2", version: "0" } });
    notify("notifications/initialized", {});
    const tools = (await rpc("tools/list", {})).result.tools.map((t) => t.name);
    check(["agent_apply", "agent_resume"].every((n) => tools.includes(n)), "tools/list includes agent_apply + agent_resume");

    // ---- worktree isolation + apply ----
    console.log("\n[worktree] dispatch isolated task");
    const w = await call(rpc, "agent_start", {
      prompt: "Create a file named wt.txt containing exactly: in worktree. Then stop.",
      cwd: scratch, sandbox: "workspace-write", isolation: "worktree",
    });
    check(w.ok && w.isolation === "worktree", "agent_start isolation=worktree", w.taskId);
    const ws = await poll(rpc, w.taskId);
    check(ws.state === "done", "worktree task done", `state=${ws.state}`);
    check(!!ws.worktreePath, "worktree path recorded", ws.worktreePath);
    check(!existsSync(join(scratch, "wt.txt")), "isolation: wt.txt NOT in main tree before apply");
    const wr = await call(rpc, "agent_result", { taskId: w.taskId });
    check(wr.diff?.changed === true, "worktree result has a diff");

    console.log("[worktree] apply");
    const ap = await call(rpc, "agent_apply", { taskId: w.taskId });
    check(ap.applied === true, "agent_apply merged changes", ap.reason || "");
    check(existsSync(join(scratch, "wt.txt")), "after apply: wt.txt now in main tree");

    // ---- resume (cross-session continuity) ----
    console.log("\n[resume] first turn");
    const r1 = await call(rpc, "agent_start", {
      prompt: "Remember this codeword: BANANA. Reply with just: OK",
      cwd: scratch, sandbox: "read-only", isolation: "inplace",
    });
    const r1s = await poll(rpc, r1.taskId);
    check(r1s.state === "done", "resume first turn done", `state=${r1s.state}`);
    check(!!r1s.sessionId, "first turn captured a sessionId", r1s.sessionId);

    console.log("[resume] second turn (resumed session)");
    const r2 = await call(rpc, "agent_resume", {
      taskId: r1.taskId,
      prompt: "What was the codeword I asked you to remember? Reply with just that word.",
      cwd: scratch, sandbox: "read-only",
    });
    check(r2.ok && !!r2.taskId, "agent_resume started", r2.taskId);
    const r2s = await poll(rpc, r2.taskId);
    const r2r = await call(rpc, "agent_result", { taskId: r2.taskId });
    console.log("  resumed finalMessage:", JSON.stringify(r2r.finalMessage));
    check(r2s.state === "done", "resume second turn done", `state=${r2s.state}`);
    check(/banana/i.test(r2r.finalMessage || ""), "resumed session recalled the codeword BANANA");
  } finally {
    child.kill("SIGKILL");
    rmSync(scratch, { recursive: true, force: true });
  }

  console.log(fail === 0 ? "\nSMOKE2: PASS" : `\nSMOKE2: FAIL (${fail})`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error("smoke2 crashed:", e); process.exit(2); });
