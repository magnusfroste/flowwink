import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isInterrupted, buildResumeDirective, isPlanResumeSafe, IDEMPOTENT_SKILLS } from '../../../supabase/functions/flowpilot-lifecycle/resume-logic';

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

  it('resumes an IDEMPOTENT plan from the first pending step', () => {
    const obj = {
      id: 'o1',
      goal: 'Prepare the VAT period',
      progress: { plan: { steps: [
        { skill: 'prepare_vat_return', step: 'prepare_vat_return for Q2', result: { ok: true } },
        { skill: 'accounting_reports', step: 'accounting_reports balance check', result: { ok: true } },
        { skill: 'manage_journal_entry', step: 'manage_journal_entry the VAT payment' }, // ← cursor
      ] } },
    };
    const out = buildResumeDirective(obj);
    expect(out.kind).toBe('resume');
    if (out.kind === 'resume') {
      expect(out.cursor).toBe(2);
      expect(out.directive).toMatch(/Continue from step 3/);
    }
  });

  it('REFUSES a plan whose completed step is non-idempotent (the Phase 4 case)', () => {
    const obj = {
      id: 'o2',
      goal: 'publish two posts then summarise',
      progress: { plan: { steps: [
        { skill: 'write_blog_post', step: 'write_blog_post topic A', result: { ok: true } },
        { skill: 'write_blog_post', step: 'write_blog_post topic B', result: { ok: true } },
        { skill: 'summarise', step: 'summarise the two posts' }, // ← cursor
      ] } },
    };
    const out = buildResumeDirective(obj);
    // write_blog_post is not idempotent → hard guard refuses, surfaces for review.
    expect(out.kind).toBe('needs_review');
    expect(isPlanResumeSafe(obj.progress.plan.steps, 2)).toBe(false);
  });

  it('the idempotency allowlist covers the money core, not generative skills', () => {
    expect(IDEMPOTENT_SKILLS.has('manage_journal_entry')).toBe(true);
    expect(IDEMPOTENT_SKILLS.has('reconciliation')).toBe(true);
    expect(IDEMPOTENT_SKILLS.has('write_blog_post')).toBe(false);
    expect(IDEMPOTENT_SKILLS.has('send_newsletter')).toBe(false);
  });

  it('returns nothing when the plan is complete or absent', () => {
    expect(buildResumeDirective({ id: 'o', goal: 'g', progress: { plan: { steps: [{ skill: 'manage_journal_entry', result: 1 }] } } }).kind).toBe('nothing');
    expect(buildResumeDirective({ id: 'o', goal: 'g', progress: {} }).kind).toBe('nothing');
    expect(buildResumeDirective({ id: 'o', goal: 'g' }).kind).toBe('nothing');
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

  it('the handler only auto-drives resume outcomes, never needs_review (Phase 2.5)', () => {
    // Phase 4 proved a soft directive re-runs completed non-idempotent steps.
    // The hard guard replaces the opt-in flag: only out.kind === 'resume' pushes
    // a directive; 'needs_review' is counted and LEFT PAUSED, never re-driven.
    const r = read('supabase/functions/flowpilot-lifecycle/resume.ts');
    expect(r).toMatch(/out\.kind === "resume"/);
    expect(r).toMatch(/out\.kind === "needs_review"/);
    expect(r).toMatch(/needs_review: needsReview/);
    // The old opt-in gate is gone — the guard itself is the gate now.
    expect(r).not.toMatch(/directives_gated/);
  });
});
