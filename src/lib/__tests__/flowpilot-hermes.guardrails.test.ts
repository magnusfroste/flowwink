import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * FlowPilot 2.0 "Hermes experience" guardrails (2026-07-12).
 *
 * The fast-forward sim exposed three operator-quality gaps; each got a fix in
 * the heartbeat/reason seam. These static checks pin the fixes so a refactor
 * can't silently regress them (each was proven live in the sim harness):
 *
 * 1. HOLLOW TURN — day 2 of the baseline sim ended with "Preparing to
 *    generate…" and no execution. The heartbeat now runs a bounded completion
 *    pass when a cycle with active objectives executed zero business skills.
 * 2. search_skills COUNTED AS BUSINESS SKILL — the dispatch meta-tool wasn't
 *    in BUILT_IN_TOOL_NAMES, so a cycle that only *searched* looked like it
 *    executed, defeating the hollow-turn check.
 * 3. CONTENT AMNESIA — 6 near-identical blog titles in 6 simulated days.
 *    The heartbeat context now includes recent blog titles so a recurring
 *    content objective differentiates instead of re-wording.
 * 4. FOLLOW-THROUGH PRE-PASS — approvals complete at the START of each
 *    heartbeat and the results are surfaced in that cycle's context
 *    (design doc flowpilot-2.0.md Phase 1: resumption is first-class).
 */

const root = join(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('flowpilot hermes guardrails', () => {
  const heartbeat = read('supabase/functions/flowpilot-heartbeat/index.ts');
  const reason = read('supabase/functions/_shared/pilot/reason.ts');

  it('heartbeat runs the follow-through pre-pass and feeds its result into context', () => {
    expect(heartbeat).toContain('runFollowThroughPrePass');
    expect(heartbeat).toContain('flowpilot-lifecycle?task=followthrough');
    // the result must reach the prompt, not just run silently
    expect(heartbeat).toMatch(/statsContext:.*followThroughCtx/s);
  });

  it('heartbeat detects hollow turns and runs a bounded completion pass', () => {
    expect(heartbeat).toContain('Hollow turn detected');
    // gate on zero successful business skills + active objectives
    expect(heartbeat).toMatch(/businessSuccesses === 0/);
    expect(heartbeat).toMatch(/status.*active/);
    // bounded: wall-clock + token budget checks, never unbounded recursion
    expect(heartbeat).toMatch(/wallClockLeft > /);
    expect(heartbeat).toMatch(/budgetLeft > /);
  });

  it('search_skills is a built-in meta tool, not a business skill', () => {
    const setMatch = reason.match(/const BUILT_IN_TOOL_NAMES = new Set\(\[[\s\S]*?\]\);/);
    expect(setMatch, 'BUILT_IN_TOOL_NAMES set not found').toBeTruthy();
    expect(setMatch![0]).toContain("'search_skills'");
  });

  it('heartbeat context includes recent blog titles (content differentiation)', () => {
    expect(heartbeat).toMatch(/recent blog output/i);
    expect(heartbeat).toMatch(/from\("blog_posts"\)[\s\S]*?select\("title/);
  });

  it('completion pass merges results so the heartbeat log reflects both passes', () => {
    // token usage from both passes must be summed, not overwritten
    expect(heartbeat).toMatch(/total_tokens:.*\+.*total_tokens/s);
    expect(heartbeat).toMatch(/skillResults:.*\.\.\..*skillResults/s);
  });
});
