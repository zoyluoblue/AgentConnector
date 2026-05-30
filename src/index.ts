#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { createServer } from "./server.js";
import { log } from "./util/log.js";

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main(): Promise<void> {
  const cfg = loadConfig();
  const { server, store } = createServer(cfg);

  let shuttingDown = false;
  const shutdown = (reason: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info(`shutting down (${reason}); killing running tasks + cleaning worktrees`);
    void Promise.race([store.shutdown(), delay(2500)]).finally(() => process.exit(0));
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  const transport = new StdioServerTransport();
  transport.onclose = () => shutdown("transport-close");

  await server.connect(transport);
  log.info(
    `agentconnector v0.4 connected (stdio); executor=${cfg.defaultExecutor}, sandbox=${cfg.defaultSandbox}, isolation=${cfg.defaultIsolation}, maxConcurrent=${cfg.maxConcurrent}, logLevel=${cfg.logLevel}`,
  );
}

main().catch((err) => {
  log.error("fatal", String(err));
  process.exit(1);
});
