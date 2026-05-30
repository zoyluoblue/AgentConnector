// Phase 3 smoke (fast, no model calls): agent_executors availability + graceful
// failure for an uninstalled backend. Run: node scripts/smoke3.mjs
import { spawn } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");

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
const payload = (res) => JSON.parse(res.result.content[0].text);

async function main() {
  const { child, rpc, notify } = startServer();
  let fail = 0;
  const check = (c, label, extra) => { console.log(`${c ? "✓" : "✗"} ${label}${extra ? ` — ${extra}` : ""}`); if (!c) fail++; };
  try {
    await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "smoke3", version: "0" } });
    notify("notifications/initialized", {});
    const tools = (await rpc("tools/list", {})).result.tools.map((t) => t.name);
    check(tools.includes("agent_executors"), "tools/list includes agent_executors");

    const ex = payload(await rpc("tools/call", { name: "agent_executors", arguments: {} }));
    const by = Object.fromEntries(ex.executors.map((e) => [e.name, e]));
    console.log("  executors:", ex.executors.map((e) => `${e.name}(avail=${e.available},exp=${e.experimental})`).join(", "));
    check(ex.default === "codex", "default executor is codex");
    check(by.codex?.available === true, "codex available");
    check(by.gemini?.available === false && by.gemini?.experimental === true, "gemini unavailable + experimental");
    check(by.grok?.available === false && by.grok?.experimental === true, "grok unavailable + experimental");

    const g = payload(await rpc("tools/call", { name: "agent_start", arguments: { executor: "gemini", prompt: "hi" } }));
    check(g.ok === false && /not available/.test(g.error || ""), "agent_start executor=gemini fails gracefully", g.error);
  } finally {
    child.kill("SIGKILL");
  }
  console.log(fail === 0 ? "\nSMOKE3: PASS" : `\nSMOKE3: FAIL (${fail})`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error("smoke3 crashed:", e); process.exit(2); });
