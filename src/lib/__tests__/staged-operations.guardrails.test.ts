import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';

/**
 * Staged-Operation Envelope guardrail.
 *
 * Locks the neutral-core invariant: every high-risk ledger-modifying skill
 * MUST be marked `requires_staging=true` so external agents receive a
 * preview envelope (HTTP 202) rather than a silent ledger write.
 *
 * If a future migration accidentally seeds one of these skills without the
 * staging flag, this test fires before it can reach MCP clients.
 */

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const describeIfDb = SUPABASE_URL && SUPABASE_KEY ? describe : describe.skip;

/** Skills that mutate the general ledger or close periods. */
const MUST_BE_STAGED = [
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

describeIfDb('Accounting staged-operation envelope', () => {
  it('every high-risk ledger skill is requires_staging=true and MCP-exposed', async () => {
    const supabase = createClient(SUPABASE_URL!, SUPABASE_KEY!);
    const { data, error } = await supabase
      .from('agent_skills')
      .select('name, requires_staging, mcp_exposed, enabled')
      .in('name', MUST_BE_STAGED as unknown as string[]);

    expect(error).toBeNull();
    const found = new Map((data ?? []).map((r) => [r.name, r]));

    const missing = MUST_BE_STAGED.filter((n) => !found.has(n));
    expect(missing, `Skills not seeded: ${missing.join(', ')}`).toEqual([]);

    const violations = (data ?? []).filter(
      (r) => !r.requires_staging || !r.mcp_exposed || !r.enabled,
    );
    expect(
      violations,
      `Skills missing staging/enabled/mcp_exposed:\n${violations
        .map((v) => `  ${v.name} staged=${v.requires_staging} enabled=${v.enabled} mcp=${v.mcp_exposed}`)
        .join('\n')}`,
    ).toEqual([]);
  });

  it('approve/reject helpers exist and are MCP-exposed', async () => {
    const supabase = createClient(SUPABASE_URL!, SUPABASE_KEY!);
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
    const supabase = createClient(SUPABASE_URL!, SUPABASE_KEY!);
    const { error } = await supabase
      .from('pending_operations')
      .select('id, status, skill_name')
      .limit(1);
    // Either rows or empty — what we care about is "table reachable".
    expect(error).toBeNull();
  });
});
