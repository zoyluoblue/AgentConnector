import { describe, it, expect } from "vitest";
import { ensureBuiltins, executorsInfo, getExecutor, listExecutors, registerExecutor } from "../src/executor/registry";
import type { Executor, RunHandle, StartArgs } from "../src/executor/types";
import { binExists } from "../src/util/which";

const mock: Executor = {
  name: "mock",
  experimental: false,
  capabilities: {
    structuredOutput: true,
    jsonEvents: true,
    cancel: true,
    resume: true,
    nativeReview: false,
    sandboxModes: ["read-only"],
  },
  isAvailable: () => true,
  start: (_args: StartArgs): RunHandle => ({
    pid: undefined,
    onEvent() {},
    onStderr() {},
    done: Promise.resolve({ exitCode: 0, signal: null }),
    readFinalMessage: async () => "mock",
    kill() {},
    cleanup() {},
  }),
};

describe("binExists (availability detection)", () => {
  it("finds a real binary and rejects a fake one", () => {
    expect(binExists("node")).toBe(true);
    expect(binExists("definitely-not-a-real-binary-xyz-123")).toBe(false);
  });
});

describe("executor registry / routing", () => {
  it("registers all built-in backends", () => {
    ensureBuiltins();
    const names = listExecutors();
    expect(names).toContain("codex");
    expect(names).toContain("gemini");
    expect(names).toContain("grok");
  });

  it("resolves by name with a default fallback", () => {
    ensureBuiltins();
    expect(getExecutor(undefined, "codex").name).toBe("codex");
    expect(getExecutor("gemini", "codex").name).toBe("gemini");
  });

  it("throws a helpful error for an unknown executor", () => {
    ensureBuiltins();
    expect(() => getExecutor("nope", "codex")).toThrow(/unknown executor/);
  });

  it("a new backend is a drop-in: register + route, no tool-surface change", () => {
    registerExecutor(mock);
    const ex = getExecutor("mock", "codex");
    expect(ex.name).toBe("mock");
    expect(ex.capabilities.resume).toBe(true);
    expect(ex.isAvailable()).toBe(true);
  });

  it("executorsInfo reports availability + experimental flags with a stable shape", () => {
    ensureBuiltins();
    const info = executorsInfo();
    for (const e of info) {
      expect(typeof e.name).toBe("string");
      expect(typeof e.available).toBe("boolean");
      expect(typeof e.experimental).toBe("boolean");
      expect(e.capabilities).toBeTruthy();
    }
    expect(info.find((i) => i.name === "gemini")?.experimental).toBe(true);
    expect(info.find((i) => i.name === "codex")?.experimental).toBe(false);
  });
});
