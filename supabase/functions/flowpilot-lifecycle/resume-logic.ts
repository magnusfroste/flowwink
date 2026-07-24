// Resumption Phase 2 — pure logic (no Deno/DB imports, so it is unit-testable
// from Node). The handler in resume.ts wires these to the database. See
// docs/architecture/agent-resumption.md §2.3.

/** A run is interrupted if it is still 'running' well past its last checkpoint. */
export function isInterrupted(run: { status: string; updated_at: string }, staleMs: number, nowMs: number): boolean {
  return run.status === "running" && (nowMs - new Date(run.updated_at).getTime()) > staleMs;
}

export interface PlanStep { id?: string; order?: number; step?: string; result?: unknown; output?: unknown }

function describeStep(s: PlanStep): string {
  return String(s.step || s.id || `step ${(s.order ?? 0)}`).slice(0, 120);
}

/**
 * Given an objective's progress.plan, find the resume point. A step counts as
 * DONE when it carries a result/output. Returns null when there is no plan or
 * the plan is already complete (nothing to resume).
 */
export function buildResumeDirective(objective: {
  id: string;
  goal: string;
  progress?: { plan?: { steps?: PlanStep[] } };
}): { cursor: number; total: number; directive: string } | null {
  const steps = objective.progress?.plan?.steps;
  if (!Array.isArray(steps) || steps.length === 0) return null;

  const isDone = (s: PlanStep) =>
    (s.result !== undefined && s.result !== null) || (s.output !== undefined && s.output !== null);
  const cursor = steps.findIndex((s) => !isDone(s));
  if (cursor === -1) return null; // all steps done — nothing to resume

  const done = steps.slice(0, cursor).map((s, i) => `  ${i + 1}. ${describeStep(s)} — done`);
  const next = describeStep(steps[cursor]);
  const goal = objective.goal.split("\n")[0].slice(0, 100);

  const directive =
    `RESUMING an interrupted run for objective "${goal}". ` +
    `Its plan is ${cursor}/${steps.length} complete — do NOT repeat completed steps:\n` +
    `${done.join("\n")}\n` +
    `Continue from step ${cursor + 1}: ${next}. Complete the remaining steps, then evaluate outcomes.`;

  return { cursor, total: steps.length, directive };
}
