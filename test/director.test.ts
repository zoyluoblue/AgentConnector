import { describe, it, expect } from "vitest";
import { parseClaudeEnvelope } from "../src/director/claudeRunner";
import { coercePlan, coerceVerdict } from "../src/director/schemas";
import { buildPlanPrompt } from "../src/director/planner";
import { buildReviewPrompt } from "../src/director/reviewer";

const planObj = {
  summary: "do it",
  phases: [{ id: "p1", title: "T", goal: "g", codePlan: "c", uiPlan: "N/A", acceptanceCriteria: ["a", "b"] }],
};

describe("parseClaudeEnvelope", () => {
  it("parses result delivered as a JSON string (json-schema mode)", () => {
    const out = JSON.stringify({
      type: "result",
      subtype: "success",
      is_error: false,
      result: JSON.stringify(planObj),
      session_id: "s1",
      total_cost_usd: 0.02,
    });
    const r = parseClaudeEnvelope(out, "", 0);
    expect(r.ok).toBe(true);
    expect(r.sessionId).toBe("s1");
    expect((r.structured as { phases: unknown[] }).phases.length).toBe(1);
  });

  it("parses result delivered as an object", () => {
    const out = JSON.stringify({ type: "result", is_error: false, result: planObj });
    const r = parseClaudeEnvelope(out, "", 0);
    expect(r.ok).toBe(true);
    expect((r.structured as { summary: string }).summary).toBe("do it");
  });

  it("flags is_error envelopes", () => {
    const out = JSON.stringify({ type: "result", subtype: "error", is_error: true, result: "boom" });
    const r = parseClaudeEnvelope(out, "", 0);
    expect(r.ok).toBe(false);
    expect(r.error).toContain("boom");
  });

  it("handles non-JSON stdout", () => {
    const r = parseClaudeEnvelope("not json at all", "stderr msg", 1);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/non-JSON/);
  });
});

describe("coercePlan / coerceVerdict", () => {
  it("coerces a valid plan and defaults missing fields", () => {
    const p = coercePlan({ summary: "s", phases: [{ title: "only title" }] });
    expect(p?.phases[0]?.id).toBe("phase-1");
    expect(p?.phases[0]?.uiPlan).toBe("N/A");
    expect(Array.isArray(p?.phases[0]?.acceptanceCriteria)).toBe(true);
  });

  it("rejects a plan without phases", () => {
    expect(coercePlan({ summary: "s", phases: [] })).toBeUndefined();
    expect(coercePlan(null)).toBeUndefined();
  });

  it("coerces a verdict and rejects non-boolean pass", () => {
    const v = coerceVerdict({ pass: false, summary: "no", findings: [{ severity: "major", note: "x" }], requiredChanges: ["fix"] });
    expect(v?.pass).toBe(false);
    expect(v?.findings[0]?.severity).toBe("major");
    expect(coerceVerdict({ summary: "x" })).toBeUndefined();
  });
});

describe("prompts", () => {
  it("plan prompt includes the goal + criteria instruction", () => {
    const p = buildPlanPrompt("build X");
    expect(p).toContain("build X");
    expect(p).toContain("acceptanceCriteria");
  });

  it("review prompt includes criteria + diff", () => {
    const p = buildReviewPrompt(
      { id: "p1", title: "T", goal: "g", codePlan: "c", uiPlan: "N/A", acceptanceCriteria: ["crit1"] },
      "the diff text",
    );
    expect(p).toContain("crit1");
    expect(p).toContain("the diff text");
  });
});
