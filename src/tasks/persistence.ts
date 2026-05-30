import { mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Isolation } from "../config.js";
import type { DiffResult } from "../diff/gitDiff.js";
import type { SandboxMode, TaskState } from "../executor/types.js";
import type { WorktreeInfo } from "../git/worktree.js";
import { log } from "../util/log.js";
import type { TaskRecord } from "./taskTypes.js";

/** The serializable subset of a TaskRecord (no live handle, no event payloads). */
export interface TaskSnapshot {
  v: 1;
  taskId: string;
  label?: string;
  executor: string;
  state: TaskState;
  cwd: string;
  sandbox: SandboxMode;
  model?: string;
  isolation: Isolation;
  worktree?: WorktreeInfo;
  pid?: number;
  startedAt: number;
  finishedAt?: number;
  exitCode?: number | null;
  exitSignal?: NodeJS.Signals | null;
  canceledByUs: boolean;
  eventCount: number;
  lastEventKind?: string;
  sessionId?: string;
  resumeOfSessionId?: string;
  finalMessage?: string;
  structuredOutput?: unknown;
  structuredParseError?: string;
  diff?: DiffResult;
  stderrTail: string[];
  hasOutputSchema: boolean;
  attempt: number;
  maxRetries: number;
  appliedAt?: number;
  error?: string;
}

export function snapshot(rec: TaskRecord): TaskSnapshot {
  return {
    v: 1,
    taskId: rec.taskId,
    label: rec.label,
    executor: rec.executor,
    state: rec.state,
    cwd: rec.cwd,
    sandbox: rec.sandbox,
    model: rec.model,
    isolation: rec.isolation,
    worktree: rec.worktree,
    pid: rec.pid,
    startedAt: rec.startedAt,
    finishedAt: rec.finishedAt,
    exitCode: rec.exitCode,
    exitSignal: rec.exitSignal,
    canceledByUs: rec.canceledByUs,
    eventCount: rec.eventCount,
    lastEventKind: rec.lastEventKind,
    sessionId: rec.sessionId,
    resumeOfSessionId: rec.resumeOfSessionId,
    finalMessage: rec.finalMessage,
    structuredOutput: rec.structuredOutput,
    structuredParseError: rec.structuredParseError,
    diff: rec.diff,
    stderrTail: rec.stderrTail.slice(-50),
    hasOutputSchema: rec.hasOutputSchema,
    attempt: rec.attempt,
    maxRetries: rec.maxRetries,
    appliedAt: rec.appliedAt,
    error: rec.error,
  };
}

/** Writes task snapshots to <stateDir>/tasks/<id>.json (atomic tmp+rename). */
export class Persistence {
  private readonly dir: string;

  constructor(stateDir: string) {
    this.dir = join(stateDir, "tasks");
    try {
      mkdirSync(this.dir, { recursive: true });
    } catch (e) {
      log.warn("persistence mkdir failed", String(e));
    }
  }

  save(snap: TaskSnapshot): void {
    const file = join(this.dir, `${snap.taskId}.json`);
    const tmp = `${file}.tmp`;
    try {
      writeFileSync(tmp, JSON.stringify(snap), "utf8");
      renameSync(tmp, file);
    } catch (e) {
      log.warn("persistence save failed", String(e));
    }
  }

  loadAll(): TaskSnapshot[] {
    let files: string[];
    try {
      files = readdirSync(this.dir).filter((f) => f.endsWith(".json"));
    } catch {
      return [];
    }
    const out: TaskSnapshot[] = [];
    for (const f of files) {
      try {
        const snap = JSON.parse(readFileSync(join(this.dir, f), "utf8")) as TaskSnapshot;
        if (snap && snap.taskId) out.push(snap);
      } catch (e) {
        log.warn(`persistence load failed for ${f}`, String(e));
      }
    }
    return out;
  }
}
