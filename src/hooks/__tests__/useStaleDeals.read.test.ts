import { describe, it, expect, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { readStaleDealsResult } from '../useStaleDeals';

/**
 * agent-execute answers a failed skill with HTTP 200 and an envelope. The Deals
 * page rendered for a moment and then died on optic (2026-10-07): the card read
 * `data.deals.length` off { status: 'failed', result: { error } }.
 */
describe('the stale-deals answer the Deals page reads', () => {
  const ok = { threshold_days: 14, stale_count: 0, total_value_at_risk_cents: 0, deals: [] };

  it('unwraps the result, enveloped or bare', () => {
    expect(readStaleDealsResult({ status: 'success', result: ok })).toEqual(ok);
    expect(readStaleDealsResult({ result: ok })).toEqual(ok);
    expect(readStaleDealsResult(ok)).toEqual(ok);
  });

  it('a failed skill is an error, not a result with no deals', () => {
    expect(() => readStaleDealsResult({ status: 'failed', result: { error: 'Handler exception: days_threshold is not defined', status: 'failed' } }))
      .toThrow(/days_threshold is not defined/);
    expect(() => readStaleDealsResult({ result: { status: 'failed', error: 'boom' } })).toThrow(/boom/);
  });

  it('an answer without a deals list is an error too', () => {
    expect(() => readStaleDealsResult(null)).toThrow(/no deals list/);
    expect(() => readStaleDealsResult({ result: { stale_count: 2 } })).toThrow(/no deals list/);
  });
});
