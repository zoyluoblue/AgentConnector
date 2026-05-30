import type { Isolation } from "../config.js";
import type { DiffResult } from "../diff/gitDiff.js";
import type { NormalizedEvent, SandboxMode, TaskState } from "../executor/types.js";
import type { TaskRecord } from "./taskTypes.js";

export interface EventView {
  kind: string;
  text?: string;
  ts: number;
}

/** A fully serializable projection of a TaskRecord (no live handle), safe to send over IPC. */
export interface TaskView {
  taskId: string;
  label?: string;
  executor: string;
  state: TaskState;
  cwd: string;
  sandbox: SandboxMode;
  isolation: Isolation;
  model?: string;
  pid?: number;
  startedAt: number;
  finishedAt?: number;
  durationMs: number;
  exitCode?: number | null;
  attempt: number;
  maxRetries: number;
  sessionId?: string;
  resumeOfSessionId?: string;
  lastEventKind?: string;
  eventCount: number;
  recentEvents: EventView[];
  finalMessage?: string;
  structuredOutput?: unknown;
  structuredParseError?: string;
  diff?: DiffResult;
  stderrTail: string[];
  worktreePath?: string;
  appliedAt?: number;
  error?: string;
  hasResult: boolean;
  hasDiff: boolean;
}

function clip(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

export function toTaskView(rec: TaskRecord, opts: { events?: number } = {}): TaskView {
  const n = opts.events ?? 80;
  return {
    taskId: rec.taskId,
    label: rec.label,
    executor: rec.executor,
    state: rec.state,
    cwd: rec.cwd,
    sandbox: rec.sandbox,
    isolation: rec.isolation,
    model: rec.model,
    pid: rec.pid,
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
    recentEvents: rec.events.slice(-n).map((e) => ({ kind: e.kind, text: e.text ? clip(e.text, 4000) : undefined, ts: e.ts })),
    finalMessage: rec.finalMessage,
    structuredOutput: rec.structuredOutput,
    structuredParseError: rec.structuredParseError,
    diff: rec.diff,
    stderrTail: rec.stderrTail.slice(-80),
    worktreePath: rec.worktree?.path,
    appliedAt: rec.appliedAt,
    error: rec.error,
    hasResult: rec.finalMessage !== undefined,
    hasDiff: rec.diff !== undefined && rec.diff.changed,
  };
}
