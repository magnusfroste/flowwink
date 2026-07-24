import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isInterrupted, buildResumeDirective } from '../../../supabase/functions/flowpilot-lifecycle/resume-logic';

/**
 * Guardrail: the resumer (agent-resumption.md §2.3, Phase 2).
 *
 * Two safe mechanisms, both additive (no reasoning-hot-loop surgery):
 *   1. reconcile — a run stuck 'running' past a threshold is INTERRUPTED (the
 *      terminal checkpoint never came); mark it paused, never leave a zombie.
 *   2. resume — for a paused run whose objective plan is partly done, build a
 *      directive that names the completed steps as DONE and points at the next,
 *      injected into the cycle context so the operator continues from the
 *      cursor instead of re-deriving. Completed steps are not repeated.
 */

describe('resumer pure logic', () => {
  const now = 1_000_000_000_000;

  it('flags a stale running run as interrupted, spares a fresh one', () => {
    const stale = { status: 'running', updated_at: new Date(now - 20 * 60_000).toISOString() };
    const fresh = { status: 'running', updated_at: new Date(now - 60_000).toISOString() };
    const done = { status: 'completed', updated_at: new Date(now - 60 * 60_000).toISOString() };
    expect(isInterrupted(stale, 15 * 60_000, now)).toBe(true);
    expect(isInterrupted(fresh, 15 * 60_000, now)).toBe(false);
    // A terminal run is never interrupted, however old.
    expect(isInterrupted(done, 15 * 60_000, now)).toBe(false);
  });

  it('resumes from the first step lacking a result — completed steps marked done', () => {
    const obj = {
      id: 'o1',
      goal: 'Run the P2P chain',
      progress: { plan: { steps: [
        { step: 'create PO', result: { ok: true } },
        { step: 'receive goods', result: { ok: true } },
        { step: 'match invoice' },          // ← cursor here
        { step: 'schedule payment' },
      ] } },
    };
    const built = buildResumeDirective(obj);
    expect(built).not.toBeNull();
    expect(built!.cursor).toBe(2);
    expect(built!.total).toBe(4);
    expect(built!.directive).toMatch(/do NOT repeat completed steps/);
    expect(built!.directive).toMatch(/create PO — done/);
    expect(built!.directive).toMatch(/Continue from step 3: match invoice/);
  });

  it('returns null when the plan is complete or absent (nothing to resume)', () => {
    expect(buildResumeDirective({ id: 'o', goal: 'g', progress: { plan: { steps: [{ step: 'a', result: 1 }] } } })).toBeNull();
    expect(buildResumeDirective({ id: 'o', goal: 'g', progress: {} })).toBeNull();
    expect(buildResumeDirective({ id: 'o', goal: 'g' })).toBeNull();
  });
});

describe('resumer wiring', () => {
  const root = process.cwd();
  const read = (p: string) => readFileSync(join(root, p), 'utf8');

  it('is a bounded, never-fatal heartbeat pre-pass, additive to context', () => {
    const hb = read('supabase/functions/flowpilot-heartbeat/index.ts');
    expect(hb).toMatch(/runResumePrePass/);
    // Feeds the cycle context alongside follow-through.
    expect(hb).toMatch(/\+ followThroughCtx \+ resumeCtx/);
    // A resume keeps the heartbeat alive (not idle-short-circuited).
    expect(hb).toMatch(/!followThroughCtx && !resumeCtx/);
  });

  it('the resume task reconciles interrupted runs and never surgery-edits the loop', () => {
    const r = read('supabase/functions/flowpilot-lifecycle/resume.ts');
    expect(r).toMatch(/paused_reason: "interrupted"/);
    expect(r).toMatch(/\.eq\("status", "running"\)/);
    expect(r).toMatch(/\.lt\("updated_at", staleBefore\)/);
  });

  it('directive injection is GATED OFF by default (Phase 4 double-fire finding)', () => {
    // The live-heartbeat gate proved a soft directive re-runs completed
    // non-idempotent steps. Reconcile stays on; directives need explicit
    // opt-in until a hard no-repeat guard (Phase 2.5) exists.
    const r = read('supabase/functions/flowpilot-lifecycle/resume.ts');
    expect(r).toMatch(/const directivesEnabled = \(flag\?\.value as any\)\?\.directives === true/);
    // When gated, it still reconciles but returns no directive.
    expect(r).toMatch(/if \(!directivesEnabled\)/);
    expect(r).toMatch(/directives_gated: true/);
  });
});
