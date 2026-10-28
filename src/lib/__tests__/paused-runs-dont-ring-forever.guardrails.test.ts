import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { abandonVerdict, ABANDON_AFTER_MS } from '../../../supabase/functions/flowpilot-lifecycle/resume-logic';

/**
 * A paused run the resumer can never pick up must not ring the bell forever.
 *
 * optic, 2026-10-27: the admin bell showed one "paused FlowPilot run — needs
 * human input" for a month. The run was a heartbeat's own (hb_…, no objective,
 * no plan, cursor 0) from 2026-09-27, reconciled to paused/interrupted by the
 * resume pre-pass — which then only ever looks at paused runs WITH an
 * objective. Nothing could resume it, nothing closed it; clicking the bell
 * resolves nothing because there is no row to act on. The pass now lets go.
 */
const root = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const DAY = 24 * 60 * 60 * 1000;
const now = Date.parse('2026-10-27T12:00:00Z');
const at = (daysAgo: number) => new Date(now - daysAgo * DAY).toISOString();

describe('abandonVerdict — what the resume pass lets go of', () => {
  it("a heartbeat's own interrupted run (no objective) is let go — the optic case", () => {
    expect(abandonVerdict({ status: 'paused', paused_reason: 'interrupted', objective_id: null, resume_after: at(30) }, null, now))
      .toEqual({ abandon: true, reason: 'no_objective' });
  });

  it('an interrupted run whose objective is gone or no longer active is let go', () => {
    const run = { status: 'paused', paused_reason: 'interrupted', objective_id: 'o1', resume_after: at(1) };
    expect(abandonVerdict(run, null, now)).toEqual({ abandon: true, reason: 'no_objective' });
    expect(abandonVerdict(run, { status: 'completed' }, now)).toEqual({ abandon: true, reason: 'no_objective' });
  });

  it('an interrupted run with an active objective is kept — until it is stale', () => {
    const run = { status: 'paused', paused_reason: 'interrupted', objective_id: 'o1', resume_after: at(13) };
    expect(abandonVerdict(run, { status: 'active' }, now)).toEqual({ abandon: false });
    expect(abandonVerdict({ ...run, resume_after: at(15) }, { status: 'active' }, now)).toEqual({ abandon: true, reason: 'stale' });
    expect(ABANDON_AFTER_MS).toBe(14 * DAY);
  });

  it('only interrupted runs: awaiting_approval, window_ended and a running run are never touched', () => {
    for (const paused_reason of ['awaiting_approval', 'window_ended', 'rate_limited', 'error']) {
      expect(abandonVerdict({ status: 'paused', paused_reason, objective_id: null, resume_after: at(60) }, null, now)).toEqual({ abandon: false });
    }
    expect(abandonVerdict({ status: 'running', paused_reason: 'interrupted', objective_id: null, updated_at: at(60) }, null, now)).toEqual({ abandon: false });
  });
});

describe('the resume pass applies it, keeps the row, and tells the pulse', () => {
  const resume = read('supabase/functions/flowpilot-lifecycle/resume.ts');

  it('runs after the resume directives, never on a run being resumed this cycle', () => {
    const letGo = resume.indexOf('abandonVerdict(run, objective, nowMs)');
    expect(letGo).toBeGreaterThan(resume.indexOf('buildResumeDirective(obj as any)'));
    expect(resume).toMatch(/\.eq\("paused_reason", "interrupted"\)/);
    expect(resume).toMatch(/\.not\("trace_id", "in"/);
  });

  it('marks the run failed with the reason on paused_reason — the Trace keeps it', () => {
    expect(resume).toMatch(/status: "failed", paused_reason: `abandoned: \$\{verdict\.reason\}`/);
    expect(resume).not.toMatch(/from\("agent_runs"\)\s*\.delete\(\)/);
    expect(resume).toMatch(/needs_review: needsReview, abandoned \}/);
  });
});
