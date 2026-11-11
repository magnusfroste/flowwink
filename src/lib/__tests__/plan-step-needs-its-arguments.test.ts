import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../../../supabase/functions/_shared/ai-config.ts', () => ({ resolveAiConfig: async () => ({}) }));

/**
 * A plan step is a call only when it carries what the call needs (2026-11-12).
 *
 * decompose_objective writes each step's skill and arguments before anything
 * has been read. On optic, "Watch Peter's projects" stored comment_on_task as
 * {kind: 'question'}: which task and what to ask come from the portfolio read.
 * advance_plan ran it as stored twice a day and the journal said "body is
 * required", while the same heartbeat asked the right question on the right
 * task in its own turn. The skill's own `required` list now decides: a step
 * that leaves one empty is handed to the reasoning loop, not run and not failed.
 */
type Rows = Array<Record<string, unknown>>;

function db(tables: Record<string, Rows>, writes: Array<Record<string, unknown>>) {
  return {
    rpc: () => Promise.resolve({ data: true, error: null }),
    from(table: string) {
      const rows = tables[table] ?? [];
      const q: Record<string, unknown> = {};
      const self = () => q;
      Object.assign(q, {
        select: self, in: self, eq: self, insert: self,
        update: (v: Record<string, unknown>) => { writes.push(v); return q; },
        gte: () => Promise.resolve({ data: rows }),
        maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
        single: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
        then: (res: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(res),
      });
      return q;
    },
  };
}

const commentSkill = {
  name: 'comment_on_task',
  tool_definition: { type: 'function', function: { name: 'comment_on_task', parameters: { type: 'object', required: ['body'] } } },
};
const OBJ_ID = '11111111-2222-3333-4444-555555555555';
const objective = (stepArgs: Record<string, unknown>) => ({
  id: OBJ_ID,
  goal: "Watch Peter's projects",
  progress: { plan: { steps: [
    { id: 's1', order: 1, description: 'Ask on the hub blocker', skill_name: 'comment_on_task', skill_args: stepArgs, status: 'pending' },
  ] } },
});

describe('advance_plan hands a step it cannot fill to the reasoning loop', async () => {
  const H = await import('../../../supabase/functions/_shared/pilot/handlers.ts');
  let fetched: Array<{ skill_name: string; arguments: unknown }> = [];
  beforeAll(() => {
    vi.stubGlobal('fetch', async (_url: string, init: { body: string }) => {
      const b = JSON.parse(init.body);
      fetched.push({ skill_name: b.skill_name, arguments: b.arguments });
      return { json: async () => ({ status: 'success' }) };
    });
  });
  afterAll(() => { vi.unstubAllGlobals(); });

  it('the optic case: {kind} alone is not run, the step is handed off, nothing failed', async () => {
    fetched = [];
    const writes: Array<Record<string, unknown>> = [];
    const r = await H.handleAdvancePlan(db({ agent_objectives: [objective({ kind: 'question' })], agent_skills: [commentSkill] }, writes) as never, 'u', 'k', { objective_id: OBJ_ID });
    expect(fetched).toEqual([]);
    expect(r).toMatchObject({ status: 'needs_reasoning', skill: 'comment_on_task', missing: ['body'] });
    expect(String((r as { hint?: string }).hint)).toMatch(/Run comment_on_task yourself/);
    // The last write is the lock's release; the plan is in the last progress write.
    const plan = (writes.filter((w) => 'progress' in w).at(-1) as { progress: { plan: { steps: Array<{ status: string }>; has_failures?: boolean } } }).progress.plan;
    expect(plan.steps[0].status).toBe('handed_off');
    expect(plan.has_failures).not.toBe(true);
  });

  it('a step that carries its required arguments runs as before', async () => {
    fetched = [];
    const args = { kind: 'question', task_id: 't1', body: 'Vem äger avtalet?' };
    const r = await H.handleAdvancePlan(db({ agent_objectives: [objective(args)], agent_skills: [commentSkill] }, []) as never, 'u', 'k', { objective_id: OBJ_ID });
    expect(fetched).toEqual([{ skill_name: 'comment_on_task', arguments: args }]);
    expect(r).toMatchObject({ status: 'chain_completed' });
  });

  it('a skill it cannot read runs as before (fails open)', async () => {
    fetched = [];
    await H.handleAdvancePlan(db({ agent_objectives: [objective({ kind: 'question' })] }, []) as never, 'u', 'k', { objective_id: OBJ_ID });
    expect(fetched.map((f) => f.skill_name)).toEqual(['comment_on_task']);
  });

  it('empty strings and null count as missing; a declared-optional field does not', async () => {
    const sb = db({ agent_skills: [commentSkill] }, []);
    expect(await H.planStepMissingArgs(sb, 'comment_on_task', { body: '  ' })).toEqual(['body']);
    expect(await H.planStepMissingArgs(sb, 'comment_on_task', { body: null })).toEqual(['body']);
    expect(await H.planStepMissingArgs(sb, 'comment_on_task', { body: 'x' })).toEqual([]);
  });

  it('a handed-off step finishes the plan like a done one', () => {
    expect(H.planStepFinished({ status: 'handed_off' })).toBe(true);
    expect(H.planStepFinished({ status: 'done' })).toBe(true);
    expect(H.planStepFinished({ status: 'failed' })).toBe(false);
    expect(H.planStepFinished({ status: 'pending' })).toBe(false);
  });
});
