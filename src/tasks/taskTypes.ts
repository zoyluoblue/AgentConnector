import type { Isolation } from "../config.js";
import type { DiffResult } from "../diff/gitDiff.js";
import type { NormalizedEvent, RunHandle, SandboxMode, StartArgs, TaskState } from "../executor/types.js";
import type { WorktreeInfo } from "../git/worktree.js";

/** The full in-memory record for one task. Persisted as a TaskSnapshot subset. */
export interface TaskRecord {
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
  /** Set true before we signal a cancel, so exit is classified "canceled" not "error". */
  canceledByUs: boolean;
  events: NormalizedEvent[]; // bounded ring buffer (in-memory only)
  eventCount: number; // total observed (may exceed events.length)
  lastEventKind?: string;
  sessionId?: string;
  resumeOfSessionId?: string;
  finalMessage?: string;
  structuredOutput?: unknown;
  structuredParseError?: string;
  diff?: DiffResult;
  stderrTail: string[]; // bounded ring buffer
  handle?: RunHandle; // absent for queued or loaded-from-disk records
  startArgs?: StartArgs; // in-memory only; retained for queue/retry relaunch
  hasOutputSchema: boolean;
  attempt: number;
  maxRetries: number;
  appliedAt?: number; // when a worktree task's changes were merged to the main tree
  error?: string;
}
