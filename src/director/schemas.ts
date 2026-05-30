// Structured-output schemas (JSON Schema for `claude -p --json-schema`) + TS types
// for the planner and reviewer. These define the shape Claude must return.

export interface PlanPhase {
  id: string;
  title: string;
  goal: string;
  /** Detailed code plan for this phase. */
  codePlan: string;
  /** UI plan, or "N/A" if no UI. */
  uiPlan: string;
  /** Concrete, checkable acceptance criteria. */
  acceptanceCriteria: string[];
  /** Files likely created/modified. */
  filesLikely?: string[];
  /** Ids of phases this depends on. */
  dependsOn?: string[];
}

export interface Plan {
  summary: string;
  phases: PlanPhase[];
}

// Schema is kept permissive (no additionalProperties:false, minimal required) so
// the model reliably conforms; coercePlan fills any gaps with defaults.
export const PLAN_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    phases: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          goal: { type: "string" },
          codePlan: { type: "string" },
          uiPlan: { type: "string" },
          acceptanceCriteria: { type: "array", items: { type: "string" } },
          filesLikely: { type: "array", items: { type: "string" } },
          dependsOn: { type: "array", items: { type: "string" } },
        },
        required: ["title", "codePlan", "acceptanceCriteria"],
      },
    },
  },
  required: ["phases"],
} as const;

export type Severity = "info" | "minor" | "major" | "critical";

export interface Finding {
  severity: Severity;
  file?: string;
  line?: number;
  note: string;
}

export interface Verdict {
  pass: boolean;
  score: number; // 0..100
  summary: string;
  findings: Finding[];
  requiredChanges: string[];
}

export const VERDICT_SCHEMA = {
  type: "object",
  properties: {
    pass: { type: "boolean" },
    score: { type: "number" },
    summary: { type: "string" },
    findings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          severity: { type: "string", enum: ["info", "minor", "major", "critical"] },
          file: { type: "string" },
          line: { type: "number" },
          note: { type: "string" },
        },
        required: ["note"],
      },
    },
    requiredChanges: { type: "array", items: { type: "string" } },
  },
  required: ["pass", "summary"],
} as const;

// ---- defensive coercion (the model may return slightly-off shapes) ----

function asStr(v: unknown, def = ""): string {
  return typeof v === "string" ? v : def;
}
function asArr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

export function coercePlan(raw: unknown): Plan | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const phasesRaw = asArr(o["phases"]);
  if (phasesRaw.length === 0) return undefined;
  const phases: PlanPhase[] = phasesRaw.map((p, i) => {
    const pp = (p && typeof p === "object" ? p : {}) as Record<string, unknown>;
    return {
      id: asStr(pp["id"], `phase-${i + 1}`),
      title: asStr(pp["title"], `Phase ${i + 1}`),
      goal: asStr(pp["goal"]),
      codePlan: asStr(pp["codePlan"]),
      uiPlan: asStr(pp["uiPlan"], "N/A"),
      acceptanceCriteria: asArr(pp["acceptanceCriteria"]).map((c) => asStr(c)).filter(Boolean),
      filesLikely: asArr(pp["filesLikely"]).map((c) => asStr(c)).filter(Boolean),
      dependsOn: asArr(pp["dependsOn"]).map((c) => asStr(c)).filter(Boolean),
    };
  });
  return { summary: asStr(o["summary"]), phases };
}

export function coerceVerdict(raw: unknown): Verdict | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  if (typeof o["pass"] !== "boolean") return undefined;
  const findings: Finding[] = asArr(o["findings"]).map((f) => {
    const ff = (f && typeof f === "object" ? f : {}) as Record<string, unknown>;
    const sev = asStr(ff["severity"], "minor") as Severity;
    return {
      severity: (["info", "minor", "major", "critical"] as const).includes(sev) ? sev : "minor",
      file: typeof ff["file"] === "string" ? (ff["file"] as string) : undefined,
      line: typeof ff["line"] === "number" ? (ff["line"] as number) : undefined,
      note: asStr(ff["note"]),
    };
  });
  return {
    pass: o["pass"] as boolean,
    score: typeof o["score"] === "number" ? (o["score"] as number) : o["pass"] ? 100 : 0,
    summary: asStr(o["summary"]),
    findings,
    requiredChanges: asArr(o["requiredChanges"]).map((c) => asStr(c)).filter(Boolean),
  };
}
