import { runClaude } from "./claudeRunner.js";
import { coercePlan, PLAN_SCHEMA, type Plan } from "./schemas.js";

export interface PlannerOptions {
  cwd: string;
  model?: string;
  bin?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface PlanResult {
  ok: boolean;
  plan?: Plan;
  error?: string;
  raw: string;
}

export function buildPlanPrompt(goal: string): string {
  return [
    "You are the technical lead for this repository. Break the GOAL below into an ordered sequence of implementation PHASES.",
    "",
    "For EACH phase provide:",
    "- title: short name",
    "- goal: what this phase accomplishes",
    "- codePlan: a detailed, concrete code plan (modules/functions/changes)",
    "- uiPlan: the UI plan if UI is involved, otherwise 'N/A'",
    "- acceptanceCriteria: 2-5 concrete, checkable criteria a reviewer can verify",
    "- filesLikely: files likely created/modified",
    "- dependsOn: ids of earlier phases this depends on",
    "",
    "Rules: phases must be ordered, each independently reviewable, and build on previous ones. Inspect the repository to ground the plan in its real structure. Prefer 2-6 phases. Return ONLY the structured output matching the provided schema.",
    "",
    "GOAL:",
    goal,
  ].join("\n");
}

/** Ask Claude (read-only) to produce a structured multi-phase plan for the goal. */
export async function plan(goal: string, opts: PlannerOptions): Promise<PlanResult> {
  const r = await runClaude({
    prompt: buildPlanPrompt(goal),
    cwd: opts.cwd,
    schema: PLAN_SCHEMA,
    model: opts.model,
    readOnly: true,
    bin: opts.bin,
    signal: opts.signal,
    timeoutMs: opts.timeoutMs ?? 300_000,
  });
  if (!r.ok) return { ok: false, error: r.error ?? "planner failed", raw: r.raw };
  const p = coercePlan(r.structured);
  if (!p) return { ok: false, error: "planner returned no valid plan", raw: r.raw };
  return { ok: true, plan: p, raw: r.raw };
}
