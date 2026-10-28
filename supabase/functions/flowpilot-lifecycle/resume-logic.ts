// Resumption Phase 2 — pure logic (no Deno/DB imports, so it is unit-testable
// from Node). The handler in resume.ts wires these to the database. See
// docs/architecture/agent-resumption.md §2.3.

/** A run is interrupted if it is still 'running' well past its last checkpoint. */
export function isInterrupted(run: { status: string; updated_at: string }, staleMs: number, nowMs: number): boolean {
  return run.status === "running" && (nowMs - new Date(run.updated_at).getTime()) > staleMs;
}

export interface PlanStep { id?: string; order?: number; step?: string; skill?: string; result?: unknown; output?: unknown }

function describeStep(s: PlanStep): string {
  return String(s.step || s.id || `step ${(s.order ?? 0)}`).slice(0, 120);
}

// ─── The hard no-repeat guard (Phase 2.5) ────────────────────────────────────
//
// Phase 4 proved a soft directive isn't binding: a model re-ran completed
// non-idempotent steps anyway. The hard guard, fail-CLOSED: auto-resume ONLY
// when every COMPLETED step is safe to re-run — i.e. references a skill whose
// repeat is harmless. If a completed step created a durable artifact
// (write_blog_post, a send_*, a new record) OR we can't classify it, we do NOT
// auto-resume; the run stays paused for human review. Re-running an idempotent
// step (money core: p_reference / status guards) is by definition harmless, so
// those plans resume safely even if the model repeats a step.
//
// Allowlist, not denylist: money-adjacent autonomy fails closed. Long term this
// should be a declared `idempotent` property on the skill; this curated set is
// the pragmatic Phase 2.5 guard for the multi-step processes where resumption
// actually matters (P2P, bookkeeping).
export const IDEMPOTENT_SKILLS = new Set<string>([
  // Money core — guarded by p_reference / status transitions, safe to repeat.
  'manage_journal_entry', 'book_expense_report', 'approve_expense_report',
  'mark_payroll_paid', 'invoice_from_timesheets', 'dispose_fixed_asset',
  'record_accounting_correction', 'run_year_end', 'propose_bookkeeping',
  // Reconciliation — auto-match is a no-op on already-matched rows.
  'reconciliation', 'reconcile_transactions',
  // Reads / analysis — create no artifacts.
  'accounting_reports', 'analyze_analytics', 'prepare_vat_return',
  'list_accounting_periods', 'year_end_readiness', 'list_voucher_gaps',
]);

/** Pull the skill token a plan step references, if the step names one. */
export function extractStepSkill(s: PlanStep): string | null {
  if (s.skill && typeof s.skill === 'string') return s.skill;
  const text = String(s.step || s.id || '');
  const m = text.match(/\b([a-z][a-z0-9_]{3,})\b/);   // first snake_case-ish token
  return m ? m[1] : null;
}

/**
 * A plan is safe to auto-resume only when every COMPLETED step (0..cursor) is
 * an idempotent skill. Unknown or non-idempotent completed step → not safe.
 */
export function isPlanResumeSafe(steps: PlanStep[], cursor: number): boolean {
  for (let i = 0; i < cursor; i++) {
    const skill = extractStepSkill(steps[i]);
    if (!skill || !IDEMPOTENT_SKILLS.has(skill)) return false;
  }
  return true;
}

/**
 * Given an objective's progress.plan, find the resume point. A step counts as
 * DONE when it carries a result/output. Returns null when there is no plan or
 * the plan is already complete (nothing to resume).
 */
export type ResumeOutcome =
  | { kind: 'resume'; cursor: number; total: number; directive: string }
  | { kind: 'needs_review'; cursor: number; total: number; reason: string }
  | { kind: 'nothing' };

export function buildResumeDirective(objective: {
  id: string;
  goal: string;
  progress?: { plan?: { steps?: PlanStep[] } };
}): ResumeOutcome {
  const steps = objective.progress?.plan?.steps;
  if (!Array.isArray(steps) || steps.length === 0) return { kind: 'nothing' };

  const isDone = (s: PlanStep) =>
    (s.result !== undefined && s.result !== null) || (s.output !== undefined && s.output !== null);
  const cursor = steps.findIndex((s) => !isDone(s));
  if (cursor === -1) return { kind: 'nothing' }; // all steps done — nothing to resume

  // Hard guard (Phase 2.5): only auto-resume when re-running the completed
  // prefix is provably harmless. Otherwise surface for human review, never
  // auto-drive — this is what stops the Phase 4 double-fire.
  if (!isPlanResumeSafe(steps, cursor)) {
    return { kind: 'needs_review', cursor, total: steps.length,
      reason: 'a completed step is non-idempotent (or unclassified) — re-running it could duplicate work; left paused for review' };
  }

  const done = steps.slice(0, cursor).map((s, i) => `  ${i + 1}. ${describeStep(s)} — done`);
  const next = describeStep(steps[cursor]);
  const goal = objective.goal.split("\n")[0].slice(0, 100);

  const directive =
    `RESUMING an interrupted run for objective "${goal}". ` +
    `Its plan is ${cursor}/${steps.length} complete — do NOT repeat completed steps:\n` +
    `${done.join("\n")}\n` +
    `Continue from step ${cursor + 1}: ${next}. Complete the remaining steps, then evaluate outcomes.`;

  return { kind: 'resume', cursor, total: steps.length, directive };
}

// ─── Letting go (Phase 2.6) ──────────────────────────────────────────────────
//
// A run the resumer can never pick up must not stay 'paused' forever: the
// bell counts paused runs as "needs human input", and a run with nothing to
// resume rings for nobody. On optic a heartbeat run from 2026-09-27 — no
// objective, no plan, reconciled to paused/interrupted — rang for a month;
// the resumer only looks at runs WITH an objective, so nothing ever closed it.
//
// Two reasons to let go, both decidable without the model:
//   no_objective     — a heartbeat/ad-hoc run with no objective_id, or whose
//                      objective is gone or no longer active: nothing to
//                      continue from.
//   stale            — interrupted longer than ABANDON_AFTER_MS with the hard
//                      guard still refusing auto-resume: the human it waited
//                      for never came; a month-old cursor is history, not work.
// A run let go is marked 'failed' with the reason on paused_reason — the Trace
// keeps it, the bell stops counting it.
export const ABANDON_AFTER_MS = 14 * 24 * 60 * 60 * 1000;

export type AbandonVerdict = { abandon: false } | { abandon: true; reason: 'no_objective' | 'stale' };

export function abandonVerdict(
  run: { status: string; paused_reason?: string | null; objective_id?: string | null; resume_after?: string | null; updated_at?: string | null },
  objective: { status: string } | null | undefined,
  nowMs: number,
): AbandonVerdict {
  if (run.status !== 'paused' || run.paused_reason !== 'interrupted') return { abandon: false };
  if (!run.objective_id || !objective || objective.status !== 'active') return { abandon: true, reason: 'no_objective' };
  const since = Date.parse(run.resume_after ?? run.updated_at ?? '');
  if (Number.isFinite(since) && nowMs - since > ABANDON_AFTER_MS) return { abandon: true, reason: 'stale' };
  return { abandon: false };
}
