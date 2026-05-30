import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Persistence, snapshot } from "../src/tasks/persistence";
import type { TaskRecord } from "../src/tasks/taskTypes";

function rec(over: Partial<TaskRecord> = {}): TaskRecord {
  return {
    taskId: "tsk_test",
    executor: "codex",
    state: "done",
    cwd: "/repo",
    sandbox: "workspace-write",
    isolation: "inplace",
    startedAt: 1,
    finishedAt: 2,
    canceledByUs: false,
    events: [],
    eventCount: 3,
    stderrTail: ["a", "b"],
    hasOutputSchema: false,
    attempt: 0,
    maxRetries: 0,
    sessionId: "sess-1",
    finalMessage: "done",
    exitCode: 0,
    ...over,
  };
}

describe("Persistence", () => {
  it("round-trips snapshots through disk", () => {
    const dir = mkdtempSync(join(tmpdir(), "ac-persist-"));
    const p = new Persistence(dir);
    p.save(snapshot(rec({ taskId: "tsk_a", finalMessage: "hello" })));
    p.save(snapshot(rec({ taskId: "tsk_b", state: "error", error: "boom" })));

    const loaded = new Persistence(dir).loadAll().sort((a, b) => a.taskId.localeCompare(b.taskId));
    expect(loaded.length).toBe(2);
    expect(loaded[0].taskId).toBe("tsk_a");
    expect(loaded[0].finalMessage).toBe("hello");
    expect(loaded[1].state).toBe("error");
    expect(loaded[1].error).toBe("boom");
  });

  it("snapshot omits the live handle and event payloads but keeps counts", () => {
    const snap = snapshot(rec());
    expect("handle" in snap).toBe(false);
    expect("events" in snap).toBe(false);
    expect(snap.eventCount).toBe(3);
    expect(snap.sessionId).toBe("sess-1");
  });
});
