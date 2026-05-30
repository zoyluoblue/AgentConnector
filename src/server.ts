import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Config } from "./config.js";
import { ensureBuiltins, executorsInfo, getExecutor } from "./executor/registry.js";
import type { NormalizedEvent, SandboxMode, StartArgs } from "./executor/types.js";
import { TaskStore } from "./tasks/taskStore.js";
import type { TaskRecord } from "./tasks/taskTypes.js";
import { truncateHeadTail } from "./util/truncate.js";

const SANDBOX_VALUES = ["read-only", "workspace-write", "danger-full-access"] as const;
const sandboxEnum = z.enum(SANDBOX_VALUES);
const isolationEnum = z.enum(["inplace", "worktree"]);

/** Built-in JSON Schema for structured review output (agent_review). */
const REVIEW_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string" },
    findings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          severity: { type: "string", enum: ["info", "minor", "major", "critical"] },
          file: { type: "string" },
          line: { type: "number" },
          note: { type: "string" },
        },
        required: ["severity", "note"],
      },
    },
    verdict: { type: "string", enum: ["approve", "approve_with_nits", "request_changes"] },
  },
  required: ["summary", "findings", "verdict"],
};

export interface BuiltServer {
  server: McpServer;
  store: TaskStore;
}

export function createServer(cfg: Config): BuiltServer {
  ensureBuiltins();
  const store = new TaskStore(cfg);
  const server = new McpServer({ name: "agentconnector", version: "0.4.0" });

  // ---- agent_start ----------------------------------------------------------
  server.registerTool(
    "agent_start",
    {
      title: "Start an executor task",
      description:
        "Dispatch a coding/analysis task to an executor backend (default: codex). Returns immediately with a taskId; the task runs asynchronously (queued if at the concurrency cap). Poll agent_status, then fetch agent_result. With isolation:'worktree' the executor runs in an isolated git worktree — review then merge with agent_apply.",
      inputSchema: {
        prompt: z.string().describe("The self-contained task instructions for the executor."),
        executor: z.string().optional().describe("Executor name; defaults to the configured default (codex)."),
        cwd: z.string().optional().describe("Working directory; defaults to the server's launch directory."),
        sandbox: sandboxEnum.optional().describe("Sandbox mode; defaults to workspace-write."),
        isolation: isolationEnum.optional().describe("'worktree' runs in an isolated git worktree; 'inplace' edits the repo directly (default)."),
        model: z.string().optional().describe("Override the executor's model."),
        addDirs: z.array(z.string()).optional().describe("Extra writable directories."),
        outputSchema: z.record(z.string(), z.unknown()).optional().describe("A JSON Schema object; forces the final answer to match it."),
        retries: z.number().int().min(0).max(5).optional().describe("Auto-retry attempts on failure (default 0)."),
        label: z.string().optional().describe("Human-readable tag for agent_list."),
      },
    },
    async (args) => {
      try {
        const executor = getExecutor(args.executor, cfg.defaultExecutor);
        if (!executor.isAvailable()) return notAvailable(executor.name);
        if (args.outputSchema !== undefined && !executor.capabilities.structuredOutput) {
          return reply({ ok: false, error: `executor '${executor.name}' does not support structured output` });
        }
        const startArgs: StartArgs = {
          prompt: args.prompt,
          cwd: args.cwd ?? process.cwd(),
          sandbox: (args.sandbox as SandboxMode) ?? cfg.defaultSandbox,
          model: args.model,
          addDirs: args.addDirs,
          outputSchema: args.outputSchema,
        };
        const rec = await store.start(executor, startArgs, {
          label: args.label,
          isolation: args.isolation,
          maxRetries: args.retries,
        });
        return reply({
          ok: true,
          taskId: rec.taskId,
          executor: rec.executor,
          state: rec.state,
          pid: rec.pid,
          startedAt: rec.startedAt,
          cwd: rec.cwd,
          sandbox: rec.sandbox,
          isolation: rec.isolation,
        });
      } catch (e) {
        return reply({ ok: false, error: errMsg(e) });
      }
    },
  );

  // ---- agent_status ---------------------------------------------------------
  server.registerTool(
    "agent_status",
    {
      title: "Poll task status",
      description:
        "Get the status of one task (by taskId) or a summary of all tasks (omit taskId). Non-blocking. Do not call in a tight loop — space polls out and do other useful work between them.",
      inputSchema: { taskId: z.string().optional().describe("Task id; omit for a summary of all tasks.") },
    },
    async (args) => {
      if (!args.taskId) {
        return reply({ ok: true, ...store.stats(), tasks: store.list().map(briefView) });
      }
      const rec = store.get(args.taskId);
      if (!rec) return reply({ ok: false, error: `no task ${args.taskId}` });
      return reply({ ok: true, ...statusView(rec) });
    },
  );

  // ---- agent_result ---------------------------------------------------------
  server.registerTool(
    "agent_result",
    {
      title: "Fetch task result + diff",
      description:
        "Fetch a terminal task's final message, optional structured output, and the working-tree diff it produced. If still running/queued, returns ok:false with a hint to keep polling.",
      inputSchema: {
        taskId: z.string().describe("Task id."),
        includeDiff: z.boolean().optional().describe("Include the git diff (default true)."),
        includeEvents: z.boolean().optional().describe("Include the recent event tail (default false)."),
        maxDiffBytes: z.number().optional().describe("Further cap the diff size for this call."),
      },
    },
    async (args) => {
      const rec = store.get(args.taskId);
      if (!rec) return reply({ ok: false, error: `no task ${args.taskId}` });
      if (rec.state === "running" || rec.state === "queued") {
        return reply({ ok: false, state: rec.state, hint: "task not finished; poll agent_status" });
      }
      const includeDiff = args.includeDiff ?? true;
      const payload: Record<string, unknown> = {
        ok: true,
        taskId: rec.taskId,
        state: rec.state,
        exitCode: rec.exitCode,
        attempt: rec.attempt,
        sessionId: rec.sessionId,
        isolation: rec.isolation,
        worktreePath: rec.worktree?.path,
        appliedAt: rec.appliedAt,
        finalMessage: rec.finalMessage ?? "",
        structuredOutput: rec.structuredOutput,
        structuredParseError: rec.structuredParseError,
        error: rec.error,
        stderrTail: rec.stderrTail.slice(-20),
      };
      if (includeDiff && rec.diff) {
        let patch = rec.diff.patch;
        let truncated = rec.diff.truncated;
        if (args.maxDiffBytes && Buffer.byteLength(patch, "utf8") > args.maxDiffBytes) {
          const t = truncateHeadTail(patch, args.maxDiffBytes);
          patch = t.text;
          truncated = true;
        }
        payload["diff"] = { changed: rec.diff.changed, files: rec.diff.files, patch, truncated, totalBytes: rec.diff.totalBytes };
      }
      if (args.includeEvents) payload["events"] = rec.events.map(eventView);
      return reply(payload);
    },
  );

  // ---- agent_cancel ---------------------------------------------------------
  server.registerTool(
    "agent_cancel",
    {
      title: "Cancel a running or queued task",
      description: "Terminate a running task (kills its whole process group) or drop a queued one. Idempotent on terminal tasks.",
      inputSchema: {
        taskId: z.string().describe("Task id."),
        signal: z.enum(["SIGTERM", "SIGKILL"]).optional().describe("Initial signal for running tasks (default SIGTERM)."),
      },
    },
    async (args) => {
      const rec = store.get(args.taskId);
      if (!rec) return reply({ ok: false, error: `no task ${args.taskId}` });
      if (rec.state !== "running" && rec.state !== "queued") {
        return reply({ ok: true, alreadyTerminal: true, taskId: rec.taskId, state: rec.state });
      }
      await store.cancel(rec, (args.signal as NodeJS.Signals) ?? "SIGTERM");
      return reply({ ok: true, taskId: rec.taskId, state: rec.state });
    },
  );

  // ---- agent_list -----------------------------------------------------------
  server.registerTool(
    "agent_list",
    {
      title: "List tasks",
      description: "Enumerate tasks (live + persisted from prior sessions), optionally filtered by state or executor.",
      inputSchema: {
        state: z.enum(["queued", "running", "done", "error", "canceled"]).optional(),
        executor: z.string().optional(),
      },
    },
    async (args) => {
      let tasks = store.list();
      if (args.state) tasks = tasks.filter((t) => t.state === args.state);
      if (args.executor) tasks = tasks.filter((t) => t.executor === args.executor);
      return reply({ ok: true, count: tasks.length, tasks: tasks.map(briefView) });
    },
  );

  // ---- agent_apply ----------------------------------------------------------
  server.registerTool(
    "agent_apply",
    {
      title: "Merge a worktree task's changes",
      description:
        "Merge a completed worktree-isolated task's changes into the main working tree (git apply), then clean up the worktree. Only valid for isolation:'worktree' tasks in state 'done'.",
      inputSchema: { taskId: z.string().describe("Task id of a completed worktree-isolated task.") },
    },
    async (args) => {
      const rec = store.get(args.taskId);
      if (!rec) return reply({ ok: false, error: `no task ${args.taskId}` });
      const res = await store.apply(rec);
      return reply({ ok: res.applied, taskId: rec.taskId, applied: res.applied, reason: res.reason, appliedAt: rec.appliedAt });
    },
  );

  // ---- agent_resume ---------------------------------------------------------
  server.registerTool(
    "agent_resume",
    {
      title: "Resume a prior executor session",
      description:
        "Continue a previous executor session with a new prompt. Provide either a sessionId or a taskId whose session to resume. Useful for follow-ups that keep the executor's prior context (and across server restarts via persisted sessionId).",
      inputSchema: {
        prompt: z.string().describe("The next instructions to send to the resumed session."),
        taskId: z.string().optional().describe("Resume the session of this prior task."),
        sessionId: z.string().optional().describe("Resume this backend session id directly."),
        executor: z.string().optional(),
        sandbox: sandboxEnum.optional(),
        model: z.string().optional(),
        cwd: z.string().optional(),
      },
    },
    async (args) => {
      try {
        const executor = getExecutor(args.executor, cfg.defaultExecutor);
        if (!executor.isAvailable()) return notAvailable(executor.name);
        if (!executor.capabilities.resume) {
          return reply({ ok: false, error: `executor '${executor.name}' does not support resume` });
        }
        let sessionId = args.sessionId;
        if (!sessionId && args.taskId) {
          const prior = store.get(args.taskId);
          if (!prior) return reply({ ok: false, error: `no task ${args.taskId}` });
          sessionId = prior.sessionId;
        }
        if (!sessionId) {
          return reply({ ok: false, error: "provide a sessionId, or a taskId that has a recorded sessionId" });
        }
        const startArgs: StartArgs = {
          prompt: args.prompt,
          cwd: args.cwd ?? process.cwd(),
          sandbox: (args.sandbox as SandboxMode) ?? cfg.defaultSandbox,
          model: args.model,
          resumeSessionId: sessionId,
        };
        const rec = await store.start(executor, startArgs, { label: "resume", isolation: "inplace" });
        return reply({ ok: true, taskId: rec.taskId, resumeOf: sessionId, executor: rec.executor, state: rec.state });
      } catch (e) {
        return reply({ ok: false, error: errMsg(e) });
      }
    },
  );

  // ---- agent_review ---------------------------------------------------------
  server.registerTool(
    "agent_review",
    {
      title: "Structured review of current changes",
      description:
        "Ask an executor to review the repository's changes and return structured findings (summary, findings[], verdict). Runs read-only and async; poll/fetch like agent_start.",
      inputSchema: {
        instructions: z.string().optional().describe("Extra review focus, e.g. 'check error handling'."),
        executor: z.string().optional(),
        base: z.string().optional().describe("Review changes vs this base branch (else uncommitted changes)."),
        uncommitted: z.boolean().optional().describe("Review uncommitted changes (default true)."),
        cwd: z.string().optional(),
      },
    },
    async (args) => {
      try {
        const executor = getExecutor(args.executor, cfg.defaultExecutor);
        if (!executor.isAvailable()) return notAvailable(executor.name);
        const scope = args.base
          ? `the changes in this repository compared to base branch '${args.base}' (use \`git diff ${args.base}...HEAD\`)`
          : "the uncommitted changes in this repository (use `git diff` and `git status`)";
        const prompt = [
          `You are a code reviewer. Review ${scope}.`,
          args.instructions ? `Focus: ${args.instructions}` : "",
          "Inspect the diff using git, then return your review STRICTLY as JSON matching the provided output schema.",
        ]
          .filter(Boolean)
          .join("\n");
        const startArgs: StartArgs = {
          prompt,
          cwd: args.cwd ?? process.cwd(),
          sandbox: "read-only",
          outputSchema: REVIEW_SCHEMA,
        };
        const rec = await store.start(executor, startArgs, { label: "review", isolation: "inplace" });
        return reply({ ok: true, taskId: rec.taskId, executor: rec.executor, state: rec.state, kind: "review" });
      } catch (e) {
        return reply({ ok: false, error: errMsg(e) });
      }
    },
  );

  // ---- agent_stats ----------------------------------------------------------
  server.registerTool(
    "agent_stats",
    {
      title: "Task metrics",
      description: "Aggregate task counts by state for this session (live + persisted from prior sessions).",
      inputSchema: {},
    },
    async () => reply({ ok: true, ...store.stats() }),
  );

  // ---- agent_executors ------------------------------------------------------
  server.registerTool(
    "agent_executors",
    {
      title: "List executor backends",
      description: "List registered executor backends with availability (CLI installed?) and capabilities.",
      inputSchema: {},
    },
    async () => reply({ ok: true, default: cfg.defaultExecutor, executors: executorsInfo() }),
  );

  return { server, store };
}

// ---- helpers ----------------------------------------------------------------

function reply(payload: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
}

function notAvailable(name: string) {
  return reply({
    ok: false,
    error: `executor '${name}' is not available (its CLI was not found on PATH). Install it or choose another (e.g. codex).`,
  });
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function clip(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function eventView(e: NormalizedEvent) {
  return { kind: e.kind, text: e.text ? clip(e.text, 300) : undefined };
}

function briefView(rec: TaskRecord) {
  return {
    taskId: rec.taskId,
    label: rec.label,
    executor: rec.executor,
    state: rec.state,
    startedAt: rec.startedAt,
    finishedAt: rec.finishedAt,
    durationMs: (rec.finishedAt ?? Date.now()) - rec.startedAt,
  };
}

function statusView(rec: TaskRecord) {
  return {
    taskId: rec.taskId,
    label: rec.label,
    executor: rec.executor,
    state: rec.state,
    pid: rec.pid,
    isolation: rec.isolation,
    worktreePath: rec.worktree?.path,
    startedAt: rec.startedAt,
    finishedAt: rec.finishedAt,
    durationMs: (rec.finishedAt ?? Date.now()) - rec.startedAt,
    exitCode: rec.exitCode,
    attempt: rec.attempt,
    maxRetries: rec.maxRetries,
    sessionId: rec.sessionId,
    resumeOfSessionId: rec.resumeOfSessionId,
    lastEventKind: rec.lastEventKind,
    eventCount: rec.eventCount,
    recentEvents: rec.events.slice(-8).map(eventView),
    hasResult: rec.finalMessage !== undefined,
    hasDiff: rec.diff !== undefined && rec.diff.changed,
    appliedAt: rec.appliedAt,
  };
}
