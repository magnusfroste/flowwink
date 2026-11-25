import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../supabase/functions/_shared/ai-config.ts', () => ({ resolveAiConfig: async () => ({}) }));

/**
 * evaluate_outcomes answers about the actions it hands over (2026-11-25).
 *
 * The heartbeat's first step carried ~12 600 characters from it: the
 * scorecard of every skill scored lately (23–32 skills on the fleet) and ten
 * learnings with the model's own outcome_data inside. The model is asked to
 * judge at most five actions; the scorecard and learnings now speak of those
 * skills (and any flagged as underperforming), and a learning is its lesson.
 */
const handlers = async () => await import('../../../supabase/functions/_shared/pilot/handlers.ts');

function fakeDb(byTable: (table: string, select: string) => unknown[]) {
  return {
    from: (table: string) => {
      let select = '';
      const special: Record<string, unknown> = {
        select: (s: string) => { select = s; return chain; },
        update: () => ({ in: () => Promise.resolve({}), eq: () => Promise.resolve({}) }),
        insert: () => Promise.resolve({}),
        then: (res: (v: unknown) => unknown) => res({ data: byTable(table, select), count: 0 }),
      };
      const chain: unknown = new Proxy({}, { get: (_t, p: string) => (p in special ? special[p] : () => chain) });
      return chain;
    },
  };
}

describe('evaluate_outcomes speaks of what is judged', async () => {
  const H = await handlers();
  it('scorecard and learnings cover the judged skills only, learnings without their data', async () => {
    const now = new Date().toISOString();
    const unscored = [{ id: 'w1', skill_name: 'write_blog_post', input: { trace_id: 't', title: 'x' }, output: {}, status: 'success', created_at: now, duration_ms: 1, outcome_status: null }];
    const history = [
      ...Array.from({ length: 4 }, () => ({ skill_name: 'write_blog_post', outcome_status: 'success' })),
      ...Array.from({ length: 6 }, () => ({ skill_name: 'send_newsletter', outcome_status: 'negative' })),
      ...Array.from({ length: 30 }, (_, i) => ({ skill_name: `other_${i}`, outcome_status: 'neutral' })),
    ];
    const learnings = [
      { created_at: now, value: { skill: 'write_blog_post', outcome: 'neutral', lesson: 'L1', data: { huge: 'x'.repeat(2000) } } },
      { created_at: now, value: { skill: 'other_3', outcome: 'neutral', lesson: 'L2', data: {} } },
    ];
    let activityReads = 0;
    const db = fakeDb((table, select) => {
      if (table === 'agent_activity') {
        if (select.startsWith('id, skill_name')) return activityReads++ === 0 ? unscored : [];
        if (select === 'skill_name, outcome_status') return history;
        return [];
      }
      if (table === 'agent_memory') return learnings;
      return [];
    });
    const r = await H.handleEvaluateOutcomes(db, {}) as {
      skill_scorecard: Record<string, unknown>; recent_learnings?: Array<Record<string, unknown>>; underperforming_skills?: string[];
    };
    expect(Object.keys(r.skill_scorecard).sort()).toEqual(['send_newsletter', 'write_blog_post']);
    expect(r.underperforming_skills).toEqual(['send_newsletter']);
    expect(r.recent_learnings).toEqual([{ skill: 'write_blog_post', outcome: 'neutral', lesson: 'L1', date: now.slice(0, 10) }]);
    expect(JSON.stringify(r).length).toBeLessThan(3000);
  });
});
