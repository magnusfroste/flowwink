import { describe, expect, it, vi } from 'vitest';

// handlers.ts pulls in one Deno-side module; stub it so the pure evidence logic
// can be exercised in vitest.
vi.mock('../../../supabase/functions/_shared/ai-config.ts', () => ({ resolveAiConfig: async () => ({}) }));

/**
 * Guardrail: an objective's progress and completion must rest on EVIDENCE, not on
 * the model's prose.
 *
 * Live proof-week finding (liteit, 2026-07-19): FlowPilot recorded
 * "Momsdeklarationsutkastet är framtaget … belopp per ruta dokumenterade och
 * granskningsklara" while prepare_vat_return had failed twice (missing period
 * argument) and produced nothing. A human trusting that note could miss a filing
 * deadline. handleObjectiveUpdateProgress wrote whatever it was handed and
 * handleObjectiveComplete closed objectives unconditionally.
 *
 * The fix binds state to facts read from agent_activity + plan step status. These
 * tests EXECUTE the extracted handlers against a stub client so the behaviour —
 * not just the source text — is verified.
 */
const loadHandlers = async () =>
  await import('../../../supabase/functions/_shared/pilot/handlers.ts');

/** Minimal Supabase stub: one objective row + a list of activity rows. */
function stubClient(objective: any, activity: any[]) {
  const updates: any[] = [];
  const client: any = {
    updates,
    from(table: string) {
      const q: any = {
        _table: table,
        select: () => q,
        eq: () => q,
        in: () => q,
        gte: () => q,
        single: async () => ({ data: table === 'agent_objectives' ? objective : null }),
        update(vals: any) {
          updates.push({ table, vals });
          return { eq: async () => ({ error: null }) };
        },
        then: undefined,
      };
      if (table === 'agent_activity') {
        // the activity query is awaited directly after .gte()
        q.gte = () => Promise.resolve({ data: activity });
      }
      return q;
    },
  };
  return client;
}

const planWith = (steps: any[]) => ({ progress: { plan: { steps } } });

describe('objective evidence guardrails', async () => {
  const H = await loadHandlers();

  it('flags plan skills that never succeeded as unsupported', async () => {
    const db = stubClient(
      planWith([{ id: 's1', skill_name: 'prepare_vat_return', status: 'done' }]),
      [{ skill_name: 'prepare_vat_return', status: 'failed', error_message: 'Provide {from,to}' }],
    );
    const ev = await H.collectObjectiveEvidence(db, 'o1');
    expect(ev.unsupported).toContain('prepare_vat_return');
    expect(ev.skill_outcomes.prepare_vat_return).toMatchObject({ ok: 0, failed: 1 });
    expect(ev.skill_outcomes.prepare_vat_return.last_error).toMatch(/Provide/);
  });

  it('does NOT flag a skill that actually succeeded', async () => {
    const db = stubClient(
      planWith([{ id: 's1', skill_name: 'accounting_reports', status: 'done' }]),
      [{ skill_name: 'accounting_reports', status: 'success' }],
    );
    const ev = await H.collectObjectiveEvidence(db, 'o1');
    expect(ev.unsupported).toEqual([]);
    expect(ev.skill_outcomes.accounting_reports.ok).toBe(1);
  });

  it('progress is stamped with evidence and warns when a claim is unsupported', async () => {
    const db = stubClient(
      planWith([{ id: 's1', skill_name: 'prepare_vat_return', status: 'done' }]),
      [{ skill_name: 'prepare_vat_return', status: 'failed', error_message: 'Provide {from,to}' }],
    );
    const res = await H.handleObjectiveUpdateProgress(db, {
      objective_id: 'o1',
      progress: { rapport: 'Momsdeklarationsutkastet är framtaget' },
    });
    // the model's prose survives, but the facts ride along with it
    const written = db.updates.at(-1).vals.progress;
    expect(written.rapport).toBe('Momsdeklarationsutkastet är framtaget');
    expect(written._evidence.unsupported).toContain('prepare_vat_return');
    // and the agent is told plainly
    expect(res.status).toBe('updated_with_warning');
    expect(res.warning).toMatch(/NO successful run/);
  });

  it('REFUSES to complete an objective whose plan skill never succeeded', async () => {
    const db = stubClient(
      planWith([{ id: 's1', skill_name: 'prepare_vat_return', status: 'done' }]),
      [{ skill_name: 'prepare_vat_return', status: 'failed', error_message: 'Provide {from,to}' }],
    );
    const res = await H.handleObjectiveComplete(db, { objective_id: 'o1' });
    expect(res.status).toBe('refused');
    expect(res.error).toMatch(/not evidenced/);
    expect(res.error).toMatch(/prepare_vat_return/);
    // nothing was written to the objective
    expect(db.updates).toHaveLength(0);
  });

  it('REFUSES while plan steps are still pending or failed', async () => {
    const db = stubClient(
      planWith([
        { id: 's1', skill_name: 'accounting_reports', status: 'done' },
        { id: 's2', skill_name: null, status: 'pending' },
      ]),
      [{ skill_name: 'accounting_reports', status: 'success' }],
    );
    const res = await H.handleObjectiveComplete(db, { objective_id: 'o1' });
    expect(res.status).toBe('refused');
    expect(res.error).toMatch(/pending/);
  });

  it('completes when every step is done and every plan skill succeeded', async () => {
    const db = stubClient(
      planWith([{ id: 's1', skill_name: 'accounting_reports', status: 'done' }]),
      [{ skill_name: 'accounting_reports', status: 'success' }],
    );
    const res = await H.handleObjectiveComplete(db, { objective_id: 'o1' });
    expect(res.status).toBe('completed');
    const vals = db.updates.at(-1).vals;
    expect(vals.status).toBe('completed');
    expect(vals.progress.verified).toBe(true);
  });

  it('an objective with no plan completes but is stamped unverified (never silently blessed)', async () => {
    const db = stubClient({ progress: { note: 'ad-hoc' } }, []);
    const res = await H.handleObjectiveComplete(db, { objective_id: 'o1' });
    expect(res.status).toBe('completed');
    const vals = db.updates.at(-1).vals;
    expect(vals.progress.verified).toBe(false);
    expect(vals.progress.note).toBe('ad-hoc'); // existing progress preserved, not clobbered
  });
});
