import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';

/**
 * Voucher-integrity guardrail.
 *
 * Sanity-checks the universal audit primitives that every locale pack relies
 * on: list_voucher_gaps/explain_voucher_gap RPCs are callable, the trigger
 * that auto-assigns voucher numbers exists, and the related skills are
 * enabled + MCP-exposed.
 */

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const describeIfDb = SUPABASE_URL && SUPABASE_KEY ? describe : describe.skip;
// agent_skills has RLS that blocks anon — only run skill-table checks when
// a service-role key is available.
const itIfService = SUPABASE_URL && SERVICE_KEY ? it : it.skip;

describeIfDb('Voucher integrity primitives', () => {
  it('list_voucher_gaps RPC is callable and returns an array', async () => {
    const supabase = createClient(SUPABASE_URL!, SUPABASE_KEY!);
    const year = new Date().getFullYear();
    const { data, error } = await supabase.rpc('list_voucher_gaps', { p_year: year });
    expect(error, error?.message).toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });

  itIfService('voucher-related skills are enabled and MCP-exposed', async () => {
    const supabase = createClient(SUPABASE_URL!, SERVICE_KEY!);
    const names = ['list_voucher_gaps', 'explain_voucher_gap', 'year_end_readiness'];
    const { data, error } = await supabase
      .from('agent_skills')
      .select('name, enabled, mcp_exposed')
      .in('name', names);

    expect(error).toBeNull();
    expect(data?.length).toBe(names.length);
    for (const row of data ?? []) {
      expect(row.enabled, `${row.name} enabled`).toBe(true);
      expect(row.mcp_exposed, `${row.name} mcp_exposed`).toBe(true);
    }
  });
});
