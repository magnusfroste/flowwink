import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { describeIfServiceKey } from '@/test/live-db';

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
 * Needs a SERVICE-ROLE key: run_reconciliation_tests() seeds and mutates
 * ledger rows, and the anon surface hardening (20260822020000) took EXECUTE
 * away from anon on purpose. The suite ran keyless in CI only because the dev
 * instance was three weeks behind on migrations; the day dev caught up
 * (2026-09-06) the publishable key got 42501 — the guard, not a defect.
 * Skipped when no service key is configured.
 */

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;


describeIfServiceKey('payment_reconciliations: partial payments + reversal', () => {
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
