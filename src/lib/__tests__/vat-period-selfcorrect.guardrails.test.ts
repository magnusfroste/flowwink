import { describe, expect, it } from 'vitest';
import { resolvePeriod } from '../../../supabase/functions/_shared/handlers/accounting-vat-return-se';

/**
 * Guardrail: prepare_vat_return's missing-period error self-corrects.
 *
 * liteit heartbeat, 2026-07-19 (×3): an objective said "prepare the current
 * VAT period", the model called prepare_vat_return with NO period at all
 * (just injected _objective_context / trace_id), and got the bare
 * "Provide {from,to} or {year,month|quarter}" — which doesn't tell a model
 * that has no reliable sense of "today" what the current period even is, so
 * it could not recover. Per CLAUDE.md's self-correcting-RPC-errors pattern,
 * the error now names the concrete current month/quarter/year periods so the
 * next turn passes explicit args. A statutory draft is never silently assumed.
 */

describe('prepare_vat_return period resolution', () => {
  it('a call with no period throws an error naming the current periods', () => {
    let msg = '';
    try {
      resolvePeriod({ _objective_context: { goal: 'current VAT period' } });
    } catch (e) {
      msg = e instanceof Error ? e.message : String(e);
    }
    const now = new Date();
    const cy = now.getUTCFullYear();
    const cm = now.getUTCMonth() + 1;
    const cq = Math.floor((cm - 1) / 3) + 1;
    expect(msg).toMatch(/A VAT period is required/);
    // Concrete, computed current periods the model can pass verbatim.
    expect(msg).toContain(`{year:${cy}, month:${cm}}`);
    expect(msg).toContain(`{year:${cy}, quarter:${cq}}`);
    expect(msg).toContain(`{year:${cy}}`);
    // …and it steers by reporting frequency rather than silently guessing.
    expect(msg).toMatch(/reporting frequency/);
  });

  it('explicit periods still resolve correctly (no behaviour change)', () => {
    expect(resolvePeriod({ from: '2026-04-01', to: '2026-06-30' })).toEqual({ from: '2026-04-01', to: '2026-06-30' });
    expect(resolvePeriod({ year: 2026, quarter: 2 })).toEqual({ from: '2026-04-01', to: '2026-06-30' });
    expect(resolvePeriod({ year: 2026, month: 7 })).toEqual({ from: '2026-07-01', to: '2026-07-31' });
    expect(resolvePeriod({ year: 2026 })).toEqual({ from: '2026-01-01', to: '2026-12-31' });
  });
});
