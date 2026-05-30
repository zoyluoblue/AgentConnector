import { runClaude } from "./claudeRunner.js";
import { coerceVerdict, type PlanPhase, type Verdict, VERDICT_SCHEMA } from "./schemas.js";

export interface ReviewerOptions {
  cwd: string;
  model?: string;
  bin?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface ReviewResult {
  ok: boolean;
  verdict?: Verdict;
  error?: string;
  raw: string;
}

export function buildReviewPrompt(phase: PlanPhase, diff: string): string {
  return [
    "You are a strict code reviewer. Review the DIFF produced for the phase below against its ACCEPTANCE CRITERIA.",
    "Decide pass=true only if ALL acceptance criteria are clearly met and the change is correct. Otherwise pass=false with concrete requiredChanges the implementer must make.",
    "You may inspect the repository (read-only) for context. Return ONLY the structured output matching the schema.",
    "",
    `PHASE: ${phase.title}`,
    `GOAL: ${phase.goal}`,
    "ACCEPTANCE CRITERIA:",
    ...phase.acceptanceCriteria.map((c, i) => `  ${i + 1}. ${c}`),
    "",
    "DIFF:",
    diff && diff.trim() ? diff : "(no diff captured — the executor may have made no changes)",
  ].join("\n");
}

/** Ask Claude (read-only) to review a phase's diff against its acceptance criteria. */
export async function review(phase: PlanPhase, diff: string, opts: ReviewerOptions): Promise<ReviewResult> {
  const r = await runClaude({
    prompt: buildReviewPrompt(phase, diff),
    cwd: opts.cwd,
    schema: VERDICT_SCHEMA,
    model: opts.model,
    readOnly: true,
    bin: opts.bin,
    signal: opts.signal,
    timeoutMs: opts.timeoutMs ?? 300_000,
  });
  if (!r.ok) return { ok: false, error: r.error ?? "reviewer failed", raw: r.raw };
  const v = coerceVerdict(r.structured);
  if (!v) {
    const snippet = (r.text || r.raw || "").slice(0, 600);
    return { ok: false, error: `reviewer returned no valid verdict. Claude output: ${snippet}`, raw: r.raw };
  }
  return { ok: true, verdict: v, raw: r.raw };
}
