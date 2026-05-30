// End-to-end smoke test: spawn the built MCP server, speak JSON-RPC over stdio,
// and drive one real agent_start -> agent_status -> agent_result cycle in a
// throwaway git repo. Verifies the async lifecycle + diff capture against a live
// Codex. Run: node scripts/smoke.mjs
import { spawn, execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const POLL_MS = 1500;
const TIMEOUT_MS = 180_000;

function makeScratchRepo() {
  const dir = mkdtempSync(join(tmpdir(), "ac-smoke-"));
  execSync("git init -q && git config user.email t@t && git config user.name t", { cwd: dir });
  execSync("echo seed > seed.txt && git add -A && git commit -qm seed", { cwd: dir });
  return dir;
}

function startServer() {
  const child = spawn("node", [join(ROOT, "dist/index.js")], {
    cwd: ROOT,
    stdio: ["pipe", "pipe", "pipe"],
    env: process.env,
  });
  child.stderr.on("data", (d) => process.stderr.write(`[server] ${d}`));

  const pending = new Map();
  let buf = "";
  child.stdout.on("data", (d) => {
    buf += d.toString();
    let idx;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }
      if (msg.id !== undefined && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      }
    }
  });

  let nextId = 1;
  const rpc = (method, params) =>
    new Promise((resolve) => {
      const id = nextId++;
      pending.set(id, resolve);
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    });
  const notify = (method, params) =>
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");

  return { child, rpc, notify };
}

// extract our JSON payload from a tools/call text result
function payloadOf(res) {
  const text = res?.result?.content?.[0]?.text;
  return JSON.parse(text);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const scratch = makeScratchRepo();
  const { child, rpc, notify } = startServer();
  let failures = 0;
  const check = (cond, label) => {
    console.log(`${cond ? "✓" : "✗"} ${label}`);
    if (!cond) failures++;
  };

  try {
    const init = await rpc("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "smoke", version: "0.0.1" },
    });
    check(init?.result?.serverInfo?.name === "agentconnector", "initialize -> agentconnector");
    notify("notifications/initialized", {});

    const tools = await rpc("tools/list", {});
    const names = (tools.result?.tools ?? []).map((t) => t.name).sort();
    console.log("  tools:", names.join(", "));
    const expected = ["agent_cancel", "agent_list", "agent_result", "agent_review", "agent_start", "agent_status"];
    check(expected.every((n) => names.includes(n)), "tools/list has all 6 agent_* tools");

    const start = payloadOf(
      await rpc("tools/call", {
        name: "agent_start",
        arguments: {
          prompt: "Create a file named hello.txt containing exactly: hi from codex. Then stop.",
          cwd: scratch,
          sandbox: "workspace-write",
        },
      }),
    );
    check(start.ok && start.taskId, `agent_start -> taskId ${start.taskId}`);

    // poll
    const deadline = Date.now() + TIMEOUT_MS;
    let status;
    let sawRunning = false;
    while (Date.now() < deadline) {
      status = payloadOf(await rpc("tools/call", { name: "agent_status", arguments: { taskId: start.taskId } }));
      if (status.state === "running") sawRunning = true;
      if (status.state !== "running") break;
      await sleep(POLL_MS);
    }
    console.log("  final state:", status?.state, "exitCode:", status?.exitCode, "events:", status?.eventCount);
    check(sawRunning, "observed running state");
    check(status?.state === "done", "task reached state=done");

    const result = payloadOf(await rpc("tools/call", { name: "agent_result", arguments: { taskId: start.taskId } }));
    console.log("  finalMessage:", JSON.stringify(result.finalMessage)?.slice(0, 120));
    console.log("  diff.changed:", result.diff?.changed, "files:", JSON.stringify(result.diff?.files));
    check(result.ok && result.diff?.changed === true, "agent_result reports a non-empty diff");
    check((result.diff?.files ?? []).some((f) => f.path.includes("hello.txt")), "diff includes hello.txt");

    const list = payloadOf(await rpc("tools/call", { name: "agent_list", arguments: {} }));
    check(list.ok && list.count >= 1, "agent_list returns the task");
  } finally {
    child.kill("SIGKILL");
    rmSync(scratch, { recursive: true, force: true });
  }

  console.log(failures === 0 ? "\nSMOKE: PASS" : `\nSMOKE: FAIL (${failures})`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("smoke crashed:", e);
  process.exit(2);
});
