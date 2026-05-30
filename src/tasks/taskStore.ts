import type { Config, Isolation } from "../config.js";
import { computeDiff } from "../diff/gitDiff.js";
import type { Executor, NormalizedEvent, RunExit, StartArgs } from "../executor/types.js";
import { applyWorktree, createWorktree, isGitRepo, removeWorktree } from "../git/worktree.js";
import { newTaskId } from "../util/ids.js";
import { log } from "../util/log.js";
import { pushBounded } from "../util/truncate.js";
import { Persistence, snapshot } from "./persistence.js";
import type { TaskRecord } from "./taskTypes.js";

export interface LaunchOptions {
  label?: string;
  isolation?: Isolation;
  maxRetries?: number;
}

interface QueueEntry {
  rec: TaskRecord;
  executor: Executor;
  args: StartArgs;
  isolation: Isolation;
}

/**
 * Owns all task records in an in-memory Map (persists across tool calls within a
 * session) and mirrors snapshots to disk for crash recovery / cross-session resume.
 * Handles worktree isolation, a concurrency queue, and auto-retry.
 */
export class TaskStore {
  private readonly tasks = new Map<string, TaskRecord>();
  private readonly queue: QueueEntry[] = [];
  private readonly persistence: Persistence;

  constructor(private readonly cfg: Config) {
    this.persistence = new Persistence(cfg.stateDir);
    this.loadPersisted();
  }

  private loadPersisted(): void {
    for (const snap of this.persistence.loadAll()) {
      const rec: TaskRecord = {
        taskId: snap.taskId,
        label: snap.label,
        executor: snap.executor,
        state: snap.state,
        cwd: snap.cwd,
        sandbox: snap.sandbox,
        model: snap.model,
        isolation: snap.isolation,
        worktree: snap.worktree,
        pid: snap.pid,
        startedAt: snap.startedAt,
        finishedAt: snap.finishedAt,
        exitCode: snap.exitCode,
        exitSignal: snap.exitSignal,
        canceledByUs: snap.canceledByUs,
        events: [],
        eventCount: snap.eventCount,
        lastEventKind: snap.lastEventKind,
        sessionId: snap.sessionId,
        resumeOfSessionId: snap.resumeOfSessionId,
        finalMessage: snap.finalMessage,
        structuredOutput: snap.structuredOutput,
        structuredParseError: snap.structuredParseError,
        diff: snap.diff,
        stderrTail: snap.stderrTail ?? [],
        hasOutputSchema: snap.hasOutputSchema,
        attempt: snap.attempt ?? 0,
        maxRetries: snap.maxRetries ?? 0,
        appliedAt: snap.appliedAt,
        error: snap.error,
      };
      // A process cannot survive a server restart: reconcile non-terminal states.
      if (rec.state === "running" || rec.state === "queued") {
        rec.state = "error";
        rec.error = "interrupted by server restart";
        rec.finishedAt = rec.finishedAt ?? Date.now();
      }
      this.tasks.set(rec.taskId, rec);
    }
  }

  get(id: string): TaskRecord | undefined {
    return this.tasks.get(id);
  }
  list(): TaskRecord[] {
    return [...this.tasks.values()];
  }
  queuedCount(): number {
    return this.queue.length;
  }
  runningCount(): number {
    let n = 0;
    for (const t of this.tasks.values()) if (t.state === "running") n++;
    return n;
  }
  maxConcurrent(): number {
    return this.cfg.maxConcurrent;
  }

  stats(): { total: number; queued: number; byState: Record<string, number> } {
    const byState: Record<string, number> = { queued: 0, running: 0, done: 0, error: 0, canceled: 0 };
    for (const t of this.tasks.values()) byState[t.state] = (byState[t.state] ?? 0) + 1;
    return { total: this.tasks.size, queued: this.queue.length, byState };
  }

  /** Create a task; launch now, or queue if at the concurrency cap. Returns immediately. */
  async start(executor: Executor, args: StartArgs, opts: LaunchOptions = {}): Promise<TaskRecord> {
    const isolation: Isolation = opts.isolation ?? this.cfg.defaultIsolation;
    const rec: TaskRecord = {
      taskId: newTaskId(),
      label: opts.label,
      executor: executor.name,
      state: "queued",
      cwd: args.cwd,
      sandbox: args.sandbox,
      model: args.model,
      isolation,
      startedAt: Date.now(),
      canceledByUs: false,
      events: [],
      eventCount: 0,
      stderrTail: [],
      startArgs: args,
      hasOutputSchema: args.outputSchema !== undefined && !args.resumeSessionId,
      attempt: 0,
      maxRetries: opts.maxRetries ?? this.cfg.maxRetries,
      resumeOfSessionId: args.resumeSessionId,
    };
    this.tasks.set(rec.taskId, rec);

    if (this.runningCount() >= this.cfg.maxConcurrent) {
      this.persistence.save(snapshot(rec));
      this.queue.push({ rec, executor, args, isolation });
      log.info(`task ${rec.taskId} queued (${this.queue.length} waiting)`);
      return rec;
    }
    await this.launch({ rec, executor, args, isolation });
    return rec;
  }

  private async launch(entry: QueueEntry): Promise<void> {
    const { rec, executor, args, isolation } = entry;
    rec.state = "running";
    rec.startedAt = Date.now();

    let cwd = args.cwd;
    if (isolation === "worktree" && !args.resumeSessionId) {
      if (await isGitRepo(args.cwd)) {
        try {
          const wt = await createWorktree(args.cwd, rec.taskId);
          rec.worktree = wt;
          cwd = wt.path;
        } catch (e) {
          log.warn(`worktree create failed for ${rec.taskId}; running in-place`, String(e));
        }
      } else {
        log.warn(`isolation=worktree requested but ${args.cwd} is not a git repo; running in-place`);
      }
    }
    rec.cwd = cwd;

    const handle = executor.start({ ...args, cwd });
    rec.handle = handle;
    rec.pid = handle.pid;
    this.persistence.save(snapshot(rec));
    log.info(`task ${rec.taskId} started`, { executor: rec.executor, isolation, attempt: rec.attempt, pid: rec.pid });

    handle.onEvent((e) => this.onEvent(rec, e));
    handle.onStderr((line) => pushBounded(rec.stderrTail, line, this.cfg.maxStderrLines));
    handle.done
      .then((exit) => this.onDone(entry, exit))
      .catch((err) => log.error(`task ${rec.taskId} done handler failed`, String(err)));
  }

  private onEvent(rec: TaskRecord, e: NormalizedEvent): void {
    rec.eventCount++;
    rec.lastEventKind = e.kind;
    if (e.sessionId && !rec.sessionId) rec.sessionId = e.sessionId;
    pushBounded(rec.events, e, this.cfg.maxEvents);
  }

  private async onDone(entry: QueueEntry, exit: RunExit): Promise<void> {
    const { rec } = entry;
    const failed = !rec.canceledByUs && exit.exitCode !== 0;

    // Auto-retry transient failures with backoff.
    if (failed && rec.attempt < rec.maxRetries) {
      rec.attempt++;
      const backoff = Math.min(8000, 500 * 2 ** (rec.attempt - 1));
      log.info(`task ${rec.taskId} failed (exit ${exit.exitCode}); retry ${rec.attempt}/${rec.maxRetries} in ${backoff}ms`);
      try {
        rec.handle?.cleanup();
      } catch {
        /* ignore */
      }
      if (rec.worktree) {
        await removeWorktree(rec.worktree);
        rec.worktree = undefined;
      }
      await delay(backoff);
      await this.launch(entry);
      return;
    }

    rec.finishedAt = Date.now();
    rec.exitCode = exit.exitCode;
    rec.exitSignal = exit.signal;
    if (rec.canceledByUs) rec.state = "canceled";
    else if (exit.exitCode === 0) rec.state = "done";
    else rec.state = "error";
    log.info(`task ${rec.taskId} -> ${rec.state}`, { exitCode: exit.exitCode, durationMs: rec.finishedAt - rec.startedAt });

    let finalMessage = "";
    try {
      finalMessage = (await rec.handle?.readFinalMessage()) ?? "";
    } catch {
      /* ignore */
    }
    if (!finalMessage) finalMessage = lastAssistantText(rec.events) ?? "";
    rec.finalMessage = finalMessage;

    if (rec.hasOutputSchema && finalMessage) {
      try {
        rec.structuredOutput = JSON.parse(finalMessage);
      } catch (e) {
        rec.structuredParseError = String(e);
      }
    }

    try {
      rec.diff = await computeDiff(rec.cwd, this.cfg.maxDiffBytes);
    } catch (e) {
      log.warn(`diff failed for ${rec.taskId}`, String(e));
    }

    try {
      rec.handle?.cleanup();
    } catch {
      /* ignore */
    }

    this.persistence.save(snapshot(rec));
    this.dequeueNext();
  }

  private dequeueNext(): void {
    if (this.queue.length === 0) return;
    if (this.runningCount() >= this.cfg.maxConcurrent) return;
    const next = this.queue.shift();
    if (!next) return;
    this.launch(next).catch((e) => log.error("dequeue launch failed", String(e)));
  }

  async cancel(rec: TaskRecord, signal: NodeJS.Signals): Promise<void> {
    if (rec.state === "queued") {
      const i = this.queue.findIndex((q) => q.rec.taskId === rec.taskId);
      if (i >= 0) this.queue.splice(i, 1);
      rec.canceledByUs = true;
      rec.state = "canceled";
      rec.finishedAt = Date.now();
      this.persistence.save(snapshot(rec));
      return;
    }
    if (rec.state !== "running" || !rec.handle) return;
    rec.canceledByUs = true;
    rec.maxRetries = 0; // do not retry a cancelled task
    rec.handle.kill(signal);
    await Promise.race([rec.handle.done, delay(this.cfg.killGraceMs)]);
    if (rec.state === "running") {
      rec.handle.kill("SIGKILL");
      await Promise.race([rec.handle.done, delay(this.cfg.killGraceMs)]);
    }
  }

  /** Merge a worktree-isolated task's changes into the main working tree. */
  async apply(rec: TaskRecord): Promise<{ applied: boolean; reason?: string }> {
    if (!rec.worktree) return { applied: false, reason: "task was not worktree-isolated (nothing to merge)" };
    if (rec.state !== "done") return { applied: false, reason: `task state is '${rec.state}', expected 'done'` };
    const res = await applyWorktree(rec.worktree);
    if (res.applied) {
      rec.appliedAt = Date.now();
      this.persistence.save(snapshot(rec));
      try {
        await removeWorktree(rec.worktree);
      } catch {
        /* ignore */
      }
      rec.worktree = undefined;
    }
    return res;
  }

  /** Kill running tasks and remove leftover worktrees (server shutdown). */
  async shutdown(): Promise<void> {
    for (const t of this.tasks.values()) {
      if (t.state === "running" && t.handle) {
        try {
          t.handle.kill("SIGKILL");
        } catch {
          /* ignore */
        }
      }
      if (t.worktree) {
        try {
          await removeWorktree(t.worktree);
        } catch {
          /* ignore */
        }
      }
    }
  }
}

function lastAssistantText(events: NormalizedEvent[]): string | undefined {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e && e.kind === "assistant_text" && e.text) return e.text;
  }
  return undefined;
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
