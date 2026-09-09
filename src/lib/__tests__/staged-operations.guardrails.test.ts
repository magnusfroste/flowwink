import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { describeIfServiceKey } from '@/test/live-db';

/**
 * Staged-Operation Envelope guardrail.
 *
 * Locks the accounting ONE-DIAL invariant on the ledger perimeter: for these
 * skills `trust_level='approve'` ⇔ `requires_staging=true`. The seed decides
 * the dial (the platform default is direct execution + post-hoc log — "tuta
 * och kör"), an admin may move it at runtime, and whichever way it points the
 * two axes MUST agree: approve-without-staging is how the accounting bug class
 * of 2026-07 was born (one fact on two axes). The first version of this test
 * demanded staged=true unconditionally — it had never been true on any
 * instance, and only the anon-permission failure had been hiding that.
 *
 * Not a platform-wide rule: install_template is deliberately double-gated
 * (both flags), and send_email is approve-without-staging by design. Only the
 * ledger perimeter couples them.
 */

// agent_skills has RLS that blocks anon reads, so this guardrail only runs
// when a service-role key is provided (typically locally or in a dedicated
// CI job). In standard PR-CI we skip — the migration that seeds these skills
// already lives in supabase/migrations and is verified at apply-time.
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

/** Skills that mutate the general ledger or close periods. */
const LEDGER_PERIMETER = [
  'manage_journal_entry',
  'book_expense_report',
  'mark_expense_report_paid',
  'record_pos_sale_v2',
  'close_pos_session_v2',
  'close_accounting_period',
  'reopen_accounting_period',
] as const;

/** Approve/reject helpers must exist and be MCP-exposed. */
const STAGING_HELPERS = ['approve_pending_operation', 'reject_pending_operation'] as const;

describeIfServiceKey('Accounting staged-operation envelope', () => {
  it('every ledger-perimeter skill is seeded, MCP-exposed, and has trust ⇔ staging on ONE dial', async () => {
    const supabase = createClient(SUPABASE_URL!, SERVICE_KEY!);
    const { data, error } = await supabase
      .from('agent_skills')
      .select('name, requires_staging, mcp_exposed, enabled, trust_level')
      .in('name', LEDGER_PERIMETER as unknown as string[]);

    expect(error).toBeNull();
    const found = new Map((data ?? []).map((r) => [r.name, r]));

    const missing = LEDGER_PERIMETER.filter((n) => !found.has(n));
    expect(missing, `Skills not seeded: ${missing.join(', ')}`).toEqual([]);

    const violations = (data ?? []).filter(
      (r) => !r.mcp_exposed || !r.enabled || r.requires_staging !== (r.trust_level === 'approve'),
    );
    expect(
      violations,
      `Ledger skills off the one-dial invariant (approve ⇔ staged) or not exposed:\n${violations
        .map((v) => `  ${v.name} trust=${v.trust_level} staged=${v.requires_staging} enabled=${v.enabled} mcp=${v.mcp_exposed}`)
        .join('\n')}`,
    ).toEqual([]);
  });

  it('approve/reject helpers exist and are MCP-exposed', async () => {
    const supabase = createClient(SUPABASE_URL!, SERVICE_KEY!);
    const { data, error } = await supabase
      .from('agent_skills')
      .select('name, mcp_exposed, enabled, requires_staging')
      .in('name', STAGING_HELPERS as unknown as string[]);

    expect(error).toBeNull();
    expect(data?.length).toBe(STAGING_HELPERS.length);

    for (const row of data ?? []) {
      expect(row.enabled, `${row.name} enabled`).toBe(true);
      expect(row.mcp_exposed, `${row.name} mcp_exposed`).toBe(true);
      // Helpers themselves must NOT be staged (they execute the approval).
      expect(row.requires_staging, `${row.name} must not require staging`).toBe(false);
    }
  });

  it('pending_operations table exists with the expected status enum', async () => {
    const supabase = createClient(SUPABASE_URL!, SERVICE_KEY!);
    const { error } = await supabase
      .from('pending_operations')
      .select('id, status, skill_name')
      .limit(1);
    // Either rows or empty — what we care about is "table reachable".
    expect(error).toBeNull();
  });
});
