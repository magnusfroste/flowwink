import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../supabase/functions/_shared/ai-config.ts', () => ({ resolveAiConfig: async () => ({}) }));

/**
 * Guardrail: the heartbeat delivers its objectives before it scores the past.
 *
 * Live finding (liteit, 2026-10-14…17): the weekly blog objective was free to
 * deliver, search worked, and still no post came out. Every morning the
 * heartbeat opened with step 1, EVALUATE: evaluate_outcomes handed it fifteen
 * unscored activities, and fourteen record_outcome calls later it read the
 * objective, the blog and the calendar, and hit its 120k-token budget
 * (127–132k used) before any research. The fifteen were cron housekeeping —
 * quote reminders, subscription billing — from a backlog of 261 that never
 * empties, because the cron writes new rows faster than one heartbeat scores
 * them.
 *
 * Two halves, both locked here:
 *  1. evaluate_outcomes returns only FlowPilot's OWN actions. The outcome loop
 *     is how the operator learns from what it did; cron runs and other agents'
 *     calls are not its decisions.
 *  2. The default protocol works the objectives first and evaluates with the
 *     budget that is left.
 */
const handlers = async () => await import('../../../supabase/functions/_shared/pilot/handlers.ts');
const compiler = async () => await import('../../../supabase/functions/_shared/pilot/prompt-compiler.ts');

describe('heartbeat delivers before it scores', async () => {
  const H = await handlers();
  const P = await compiler();

  it("evaluate_outcomes reads only FlowPilot's own activity", async () => {
    const filters: Array<[string, unknown]> = [];
    type Query = {
      select(): Query; gte(): Query; order(): Query; eq(col: string, val: unknown): Query;
      limit(): Promise<{ data: unknown[] }>;
    };
    const q: Query = {
      select: () => q,
      gte: () => q,
      order: () => q,
      eq: (col, val) => { filters.push([col, val]); return q; },
      limit: () => Promise.resolve({ data: [] }),
    };
    const result = await H.handleEvaluateOutcomes({ from: () => q }, {});
    expect(filters).toContainEqual(['agent', 'flowpilot']);
    expect(filters).toContainEqual(['status', 'success']);
    expect(result).toMatchObject({ status: 'no_activities' });
  });

  it('the default protocol works objectives before it evaluates', () => {
    const protocol = P.DEFAULT_HEARTBEAT_PROTOCOL;
    const work = protocol.indexOf('WORK ACTIVE OBJECTIVES');
    const evaluate = protocol.indexOf('EVALUATE —');
    expect(work).toBeGreaterThan(-1);
    expect(evaluate).toBeGreaterThan(work);
    expect(protocol).toMatch(/^1\. WORK ACTIVE OBJECTIVES/m);
    expect(protocol).not.toMatch(/PRIORITY: evaluate/);
  });
});
