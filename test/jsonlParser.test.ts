import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createCodexJsonlParser } from "../src/executor/codex/jsonlParser";
import type { NormalizedEvent } from "../src/executor/types";

const FIXTURE = readFileSync(new URL("./fixtures/codex-events.jsonl", import.meta.url), "utf8");

function collect(chunks: (string | Buffer)[]): NormalizedEvent[] {
  const events: NormalizedEvent[] = [];
  let t = 0;
  const parser = createCodexJsonlParser((e) => events.push(e), () => ++t);
  for (const c of chunks) parser.push(c);
  parser.flush();
  return events;
}

describe("createCodexJsonlParser", () => {
  it("parses the recorded fixture into the expected normalized events", () => {
    const events = collect([FIXTURE]);
    expect(events.length).toBe(6);
    expect(events[0].kind).toBe("session_meta");
    expect(events[0].sessionId).toBe("019e76c4-8bba-7bb1-8042-485d43cba626");
    expect(events.some((e) => e.kind === "assistant_text" && e.text === "done")).toBe(true);
    expect(events.some((e) => e.kind === "tool_call")).toBe(true);
    expect(events.some((e) => e.kind === "tool_result")).toBe(true);
    expect(events[events.length - 1].kind).toBe("token_usage");
  });

  it("is robust to chunk splits at arbitrary byte boundaries", () => {
    const whole = collect([FIXTURE]);
    const bytes = Buffer.from(FIXTURE, "utf8");
    const singleByteChunks = Array.from(bytes, (b) => Buffer.from([b]));
    const split = collect(singleByteChunks);
    expect(split.map((e) => e.kind)).toEqual(whole.map((e) => e.kind));
  });

  it("turns a garbage line into an 'unknown' event without throwing", () => {
    const events = collect(["this is not json\n", '{"type":"turn.started"}\n']);
    expect(events.length).toBe(2);
    expect(events[0].kind).toBe("unknown");
    expect(events[1].kind).toBe("unknown"); // turn.started is not actionable -> unknown
  });

  it("flushes a trailing partial line on end", () => {
    const events = collect(['{"type":"thread.started","thread_id":"abc"}']); // no newline
    expect(events.length).toBe(1);
    expect(events[0].kind).toBe("session_meta");
    expect(events[0].sessionId).toBe("abc");
  });

  it("ignores blank lines", () => {
    const events = collect(["\n\n", '{"type":"turn.started"}\n', "\n"]);
    expect(events.length).toBe(1);
  });
});
