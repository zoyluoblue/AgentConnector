import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TaskStore, type StoreEvent } from "../src/tasks/taskStore";
import type { Config } from "../src/config";
import type { Executor, NormalizedEvent, RunHandle, StartArgs } from "../src/executor/types";

function cfg(): Config {
  return {
    defaultExecutor: "mock",
    defaultSandbox: "read-only",
    defaultIsolation: "inplace",
    maxConcurrent: 4,
    maxRetries: 0,
    maxDiffBytes: 1000,
    maxEvents: 100,
    maxStderrLines: 50,
    killGraceMs: 100,
    stateDir: mkdtempSync(join(tmpdir(), "ac-store-evt-")),
    logLevel: "error",
  };
}

function mockExecutor(): Executor {
  return {
    name: "mock",
    isAvailable: () => true,
    capabilities: {
      structuredOutput: false,
      jsonEvents: true,
      cancel: true,
      resume: false,
      nativeReview: false,
      sandboxModes: ["read-only"],
    },
    start(_args: StartArgs): RunHandle {
      return {
        pid: 4321,
        onEvent(cb: (e: NormalizedEvent) => void) {
          setTimeout(() => cb({ kind: "assistant_text", raw: {}, text: "hi", ts: Date.now() }), 5);
        },
        onStderr() {},
        done: new Promise((res) => setTimeout(() => res({ exitCode: 0, signal: null }), 20)),
        readFinalMessage: async () => "final message",
        kill() {},
        cleanup() {},
      };
    },
  };
}

describe("TaskStore live event stream", () => {
  it("emits activity + update events and reaches done (what the GUI subscribes to)", async () => {
    const store = new TaskStore(cfg());
    const events: StoreEvent[] = [];
    const off = store.on((e) => events.push(e));

    const rec = await store.start(mockExecutor(), { prompt: "x", cwd: process.cwd(), sandbox: "read-only" });
    await new Promise((r) => setTimeout(r, 250));
    off();

    const final = store.get(rec.taskId);
    expect(final?.state).toBe("done");
    expect(final?.finalMessage).toBe("final message");
    expect(events.some((e) => e.type === "activity")).toBe(true);
    expect(events.some((e) => e.type === "update")).toBe(true);
    expect(events.every((e) => e.taskId === rec.taskId)).toBe(true);
  });
});
