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
      not(col: string, op: string, val: unknown): Query;
      limit(): Promise<{ data: unknown[] }>;
    };
    const q: Query = {
      select: () => q,
      gte: () => q,
      order: () => q,
      eq: (col, val) => { filters.push([col, val]); return q; },
      not: (col, op, val) => { filters.push([`not ${col} ${op}`, val]); return q; },
      limit: () => Promise.resolve({ data: [] }),
    };
    const result = await H.handleEvaluateOutcomes({ from: () => q }, {});
    expect(filters).toContainEqual(['agent', 'flowpilot']);
    expect(filters).toContainEqual(['status', 'success']);
    expect(result).toMatchObject({ status: 'no_activities' });
  });

  // liteit, 2026-11-08…18: instance-health and the heartbeat's integrity gate
  // write under agent 'flowpilot' with no trace. 105 of those sat unscored;
  // every heartbeat opened with evaluate_outcomes, scored seven, and ran out
  // of budget before the week's post. Only the loop's own decisions (a trace)
  // are scored, and reads leave the queue without the model.
  it('scores only traced decisions, and reads without the model', async () => {
    const filters: Array<[string, unknown]> = [];
    const updates: Array<{ ids: unknown; patch: Record<string, unknown> }> = [];
    const row = (id: string, skill_name: string, input: Record<string, unknown>) => ({
      id, skill_name, input: { trace_id: 'hb_x', ...input }, output: {}, status: 'success',
      created_at: new Date().toISOString(), duration_ms: 1, outcome_status: null,
    });
    const rows = [
      row('r1', 'list_objectives', {}),
      row('r2', 'browse_blog', { limit: 6 }),
      row('r3', 'manage_blog_posts', { action: 'list' }),
      row('w1', 'write_blog_post', { title: 'x' }),
      row('h1', 'heartbeat', {}),
    ];
    // A builder that answers every PostgREST method; only the first query
    // (the unscored-actions read) returns rows.
    let reads = 0;
    const special: Record<string, unknown> = {
      eq: (col: string, val: unknown) => { filters.push([col, val]); return chain; },
      not: (col: string, op: string, val: unknown) => { filters.push([`not ${col} ${op}`, val]); return chain; },
      update: (patch: Record<string, unknown>) => ({
        in: (_c: string, ids: unknown) => { updates.push({ ids, patch }); return Promise.resolve({}); },
        eq: () => Promise.resolve({}),
      }),
      insert: () => Promise.resolve({}),
      then: (res: (v: unknown) => unknown) => res({ data: reads++ === 0 ? rows : [], count: 0 }),
    };
    const chain: unknown = new Proxy({}, {
      get: (_t, prop: string) => (prop in special ? special[prop] : () => chain),
    });
    const result = await H.handleEvaluateOutcomes({ from: () => chain }, {}) as { activities?: Array<{ id: string }> };

    expect(filters).toContainEqual(['not input->>trace_id is', null]);
    expect(updates).toHaveLength(1);
    expect(updates[0].ids).toEqual(['r1', 'r2', 'r3']);
    expect(updates[0].patch).toMatchObject({ outcome_status: 'neutral' });
    const handed = (result.activities ?? []).map((a) => a.id);
    expect(handed).toEqual(['w1', 'h1']);
  });

  it('a heartbeat is handed at most five actions to score by default', async () => {
    const src = (await import('node:fs')).readFileSync(
      'supabase/functions/_shared/pilot/handlers.ts', 'utf8');
    expect(src).toMatch(/const limit = args\.limit \|\| 5;/);
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
