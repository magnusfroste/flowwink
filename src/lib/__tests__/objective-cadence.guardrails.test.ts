import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../supabase/functions/_shared/ai-config.ts', () => ({ resolveAiConfig: async () => ({}) }));

/**
 * Guardrail: an objective's delivery cadence is structural, not prose.
 *
 * Live finding (autoversio, 2026-07-19): the objective said "publicera HÖGST en
 * post per dag" and FlowPilot published two. Wording describes; only structure
 * constrains. `constraints.cadence = { max, per, counts }` now measures actual
 * successful runs of `counts` from agent_activity and steps a satisfied
 * objective aside for the period.
 *
 * The other half matters just as much: a satisfied objective must not make the
 * operator idle — it is dropped from the working set so the turn goes elsewhere,
 * and a malformed cadence fails OPEN rather than silencing the agent.
 */
const load = async () => await import('../../../supabase/functions/_shared/pilot/reason.ts');

/** Stub returning the given activity rows for the agent_activity query. */
function stubClient(activity: any[]) {
  return {
    from() {
      const q: any = {
        select: () => q,
        in: () => q,
        eq: () => q,
        gte: () => Promise.resolve({ data: activity }),
      };
      return q;
    },
  } as any;
}

const blogObjective = (cadence: any) => ({
  id: 'o1',
  goal: 'Publicera en färsk bloggpost varje dag om Privat AI',
  constraints: { cadence },
  progress: {},
});
const plainObjective = { id: 'o2', goal: 'Kvalitetssäkra bokföringen', constraints: {}, progress: {} };

const todayAt = (h: number) => {
  const d = new Date();
  d.setUTCHours(h, 0, 0, 0);
  return d.toISOString();
};

describe('objective cadence guardrails', async () => {
  const R = await load();

  it('steps a satisfied objective aside for the period', async () => {
    const db = stubClient([{ skill_name: 'write_blog_post', status: 'success', created_at: todayAt(9) }]);
    const { actionable, satisfied } = await R.partitionByCadence(db, [
      blogObjective({ max: 1, per: 'day', counts: 'write_blog_post' }),
    ]);
    expect(actionable).toHaveLength(0);
    expect(satisfied[0].note).toMatch(/1\/1 per day/);
  });

  it('keeps it actionable while the quota has room, and reports what is left', async () => {
    const db = stubClient([{ skill_name: 'write_blog_post', status: 'success', created_at: todayAt(9) }]);
    const { actionable, satisfied } = await R.partitionByCadence(db, [
      blogObjective({ max: 3, per: 'day', counts: 'write_blog_post' }),
    ]);
    expect(actionable).toHaveLength(1);
    expect(actionable[0]._cadence_left).toBe(2);
    expect(satisfied).toHaveLength(0);
  });

  it("counts only FlowPilot's OWN runs — an operator's probe does not consume the quota", async () => {
    // liteit 2026-10-12: two write_blog_post probes over MCP (drafts, deleted)
    // filled the weekly quota and the blog stood still for a week.
    const filters: Array<[string, unknown]> = [];
    type Query = { select(): Query; in(): Query; eq(col: string, val: unknown): Query; gte(): Promise<{ data: unknown[] }> };
    const q: Query = {
      select: () => q,
      in: () => q,
      eq: (col, val) => { filters.push([col, val]); return q; },
      gte: () => Promise.resolve({ data: [] }),
    };
    const db = { from: () => q };
    const { actionable } = await R.partitionByCadence(db, [
      blogObjective({ max: 1, per: 'week', counts: 'write_blog_post' }),
    ]);
    expect(filters).toContainEqual(['agent', 'flowpilot']);
    expect(filters).toContainEqual(['status', 'success']);
    expect(actionable).toHaveLength(1);
  });

  it('counts only SUCCESSFUL runs — a failed attempt does not consume the quota', async () => {
    // the stub is fed only successes (the query filters status=success); a day
    // with no successful delivery leaves the objective actionable.
    const db = stubClient([]);
    const { actionable } = await R.partitionByCadence(db, [
      blogObjective({ max: 1, per: 'day', counts: 'write_blog_post' }),
    ]);
    expect(actionable).toHaveLength(1);
  });

  it('never touches objectives without a cadence', async () => {
    const db = stubClient([{ skill_name: 'write_blog_post', status: 'success', created_at: todayAt(9) }]);
    const { actionable, satisfied } = await R.partitionByCadence(db, [plainObjective]);
    expect(actionable).toEqual([plainObjective]);
    expect(satisfied).toHaveLength(0);
  });

  it('fails OPEN on malformed cadence — a config typo must not silence the operator', async () => {
    const db = stubClient([{ skill_name: 'write_blog_post', status: 'success', created_at: todayAt(9) }]);
    for (const bad of [{ max: 1, per: 'day' }, { counts: 'write_blog_post' }, { max: 0, counts: 'x' }]) {
      const { actionable } = await R.partitionByCadence(db, [blogObjective(bad)]);
      expect(actionable).toHaveLength(1);
    }
  });

  it('a satisfied blog objective does not block other work in the same turn', async () => {
    const db = stubClient([{ skill_name: 'write_blog_post', status: 'success', created_at: todayAt(9) }]);
    const { actionable, satisfied } = await R.partitionByCadence(db, [
      blogObjective({ max: 1, per: 'day', counts: 'write_blog_post' }),
      plainObjective,
    ]);
    expect(actionable).toEqual([plainObjective]); // the turn still has work
    expect(satisfied).toHaveLength(1);
  });

  it('weekly cadence uses the 7-day window, not today', async () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 86_400_000).toISOString();
    const db = stubClient([{ skill_name: 'write_blog_post', status: 'success', created_at: threeDaysAgo }]);
    // per:day → that run is outside today, so still actionable
    const day = await R.partitionByCadence(db, [blogObjective({ max: 1, per: 'day', counts: 'write_blog_post' })]);
    expect(day.actionable).toHaveLength(1);
    // per:week → it counts, quota met
    const week = await R.partitionByCadence(db, [blogObjective({ max: 1, per: 'week', counts: 'write_blog_post' })]);
    expect(week.actionable).toHaveLength(0);
  });

  describe('cadenceRefusal — the quota at the call site', () => {
    // liteit 2026-10-28: the prompt dropped the satisfied objective, the model
    // read it back via list_objectives and published six posts in ten days.
    type Rows = Array<Record<string, unknown>>;
    type ObjQuery = { select(): ObjQuery; eq(): Promise<{ data: Rows; error: null }> };
    type ActQuery = { select(): ActQuery; in(): ActQuery; eq(): ActQuery; gte(): Promise<{ data: Rows }> };
    function tableClient(objectives: Rows, activity: Rows) {
      return {
        from(table: string) {
          if (table === 'agent_objectives') {
            const q: ObjQuery = { select: () => q, eq: () => Promise.resolve({ data: objectives, error: null }) };
            return q;
          }
          const q: ActQuery = { select: () => q, in: () => q, eq: () => q, gte: () => Promise.resolve({ data: activity }) };
          return q;
        },
      };
    }
    const posted = [{ skill_name: 'write_blog_post', status: 'success', created_at: new Date(Date.now() - 86_400_000).toISOString() }];
    const weekly = blogObjective({ max: 1, per: 'week', counts: 'write_blog_post' });

    it('refuses the counted skill once every counting objective is satisfied', async () => {
      const r = await R.cadenceRefusal(tableClient([weekly], posted), 'write_blog_post');
      expect(r?.code).toBe('CADENCE_SATISFIED');
      expect(r?.retryable).toBe(false);
    });

    it('lets it through while the quota has room', async () => {
      expect(await R.cadenceRefusal(tableClient([weekly], []), 'write_blog_post')).toBeNull();
    });

    it('one counting objective with room is enough', async () => {
      const daily = { ...blogObjective({ max: 3, per: 'week', counts: 'write_blog_post' }), id: 'o3' };
      expect(await R.cadenceRefusal(tableClient([weekly, daily], posted), 'write_blog_post')).toBeNull();
    });

    it('never touches a skill no objective counts', async () => {
      expect(await R.cadenceRefusal(tableClient([weekly], posted), 'manage_blog_posts')).toBeNull();
      expect(await R.cadenceRefusal(tableClient([plainObjective], posted), 'write_blog_post')).toBeNull();
    });

    it('fails OPEN when the objectives cannot be read', async () => {
      const broken = { from: () => { throw new Error('db down'); } };
      expect(await R.cadenceRefusal(broken, 'write_blog_post')).toBeNull();
    });
  });

  it('the heartbeat enforces it in both passes, and the loop checks it before running', async () => {
    const { readFileSync } = await import('node:fs');
    const hb = readFileSync('supabase/functions/flowpilot-heartbeat/index.ts', 'utf8');
    expect(hb.match(/enforceCadence: true/g)?.length).toBe(2);
    const reasonSrc = readFileSync('supabase/functions/_shared/pilot/reason.ts', 'utf8');
    expect(reasonSrc).toMatch(/config\.enforceCadence[\s\S]{0,200}cadenceRefusal\(supabase, fnName\)/);
  });
});
