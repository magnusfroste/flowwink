import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';

/**
 * Reconciliation tests for payment ↔ invoice flow.
 *
 * Calls the SECURITY DEFINER RPC `run_reconciliation_tests()` which seeds 4
 * test invoices + 5 bank transactions, then exercises 12 scenarios covering:
 *  - partial payments (one invoice paid by two transactions)
 *  - over-payment (single tx larger than invoice → cap at invoice total)
 *  - reusing the residual of an over-paid transaction on a second invoice
 *  - currency mismatch (blocked)
 *  - negative amounts / refunds (blocked — must be reconciled separately)
 *  - full reversal (unreconcile_payment) restoring invoice and tx residuals
 *  - re-reconciling after reversal
 *  - double-reversal blocked
 *  - reversal posts a counter-entry in the journal
 * Cleans up all test rows at the end so it is idempotent.
 *
 * Skipped automatically when VITE_SUPABASE_URL is not configured.
 */

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const describeIfDb = SUPABASE_URL && SUPABASE_KEY ? describe : describe.skip;

describeIfDb('payment_reconciliations: partial payments + reversal', () => {
  it('passes all 12 reconciliation scenarios', async () => {
    const supabase = createClient(SUPABASE_URL!, SUPABASE_KEY!);
    const { data, error } = await supabase.rpc('run_reconciliation_tests');

    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
    expect(data!.length).toBeGreaterThanOrEqual(12);

    const failures = (data as Array<{ test_name: string; passed: boolean; detail: string }>)
      .filter((r) => !r.passed)
      .map((r) => `${r.test_name}: ${r.detail}`);

    expect(failures, `Failed scenarios:\n${failures.join('\n')}`).toEqual([]);
  }, 30_000);
});
