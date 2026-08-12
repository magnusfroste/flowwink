/**
 * Guardrail: MCP catalog must not advertise tools that aren't callable.
 *
 * Two invariants enforced against the LIVE agent_skills snapshot:
 *
 *   1. mcp_exposed=true → enabled=true
 *      An MCP-exposed skill that isn't enabled = orphan tool in the
 *      catalog. External operators (OpenClaw, ClawThree, Claude Desktop)
 *      will see it via tools/list and get a runtime error when calling.
 *
 *   2. Utility skills MUST be MCP-exposed.
 *      Pure utilities (URL→blocks, web scrape, PDF extract, web search)
 *      are operator-agnostic. Locking them to FlowPilot violates
 *      "MCP as Platform" — any external operator should be able to
 *      run a site migration end-to-end without FlowPilot involvement.
 *
 * Operator-internal exception:
 *   a2a_*, dispatch_claw_mission, openclaw_* are NOT capabilities for
 *   external callers — they are FlowPilot's own peer-comms primitives.
 *   They stay mcp_exposed=false intentionally.
 *
 * Snapshot source: live DB read at fixture build time.
 * Update via: psql + the migration; this test reads supabase live.
 */
import { describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { describeIfLiveDb } from '@/test/live-db';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? 'https://rzhjotxffjfsdlhrdkpj.supabase.co';
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ6aGpvdHhmZmpmc2RsaHJka3BqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU1NTk2MzAsImV4cCI6MjA4MTEzNTYzMH0.h_S8ZHuCWWz97-uzQge0sb3riHmElrKTTfs5jrwE72c';

/** Skills that are FlowPilot-internal and intentionally NOT MCP-exposed. */
const OPERATOR_INTERNAL_SKILLS = new Set([
  'a2a_chat',
  'a2a_request',
  'dispatch_claw_mission',
  'openclaw_start_session',
  'openclaw_end_session',
  'openclaw_exchange',
  'openclaw_get_status',
  'queue_beta_test',
]);

/** Pure utilities that ANY operator must be able to call directly via MCP. */
const REQUIRED_MCP_UTILITIES = [
  'migrate_url',        // site migration (ANY operator can run it, not just FlowPilot)
  'scrape_url',         // URL → markdown
  'search_web',         // web search
  'extract_pdf_text',   // PDF → text
];

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

describeIfLiveDb('MCP catalog exposure invariants (live DB)', () => {
  it('every mcp_exposed=true skill is also enabled (no orphan tools in catalog)', async () => {
    const { data, error } = await supabase
      .from('agent_skills')
      .select('name, enabled, mcp_exposed')
      .eq('mcp_exposed', true)
      .eq('enabled', false);

    expect(error, error?.message).toBeNull();
    const orphans = (data ?? []).map((r) => r.name);
    expect(
      orphans,
      `Orphan MCP tools (advertised but not callable): ${orphans.join(', ')}`,
    ).toEqual([]);
  });

  it('utility skills are MCP-exposed so external operators can run end-to-end flows', async () => {
    const { data, error } = await supabase
      .from('agent_skills')
      .select('name, mcp_exposed, enabled')
      .in('name', REQUIRED_MCP_UTILITIES);

    expect(error, error?.message).toBeNull();
    const broken = (data ?? []).filter((r) => !r.mcp_exposed || !r.enabled);
    expect(
      broken.map((r) => `${r.name}(mcp=${r.mcp_exposed},enabled=${r.enabled})`),
      'Utility skills must be enabled AND mcp_exposed for external operator parity',
    ).toEqual([]);
  });

  it('operator-internal skills are intentionally NOT exposed via MCP', async () => {
    const { data, error } = await supabase
      .from('agent_skills')
      .select('name, mcp_exposed')
      .in('name', Array.from(OPERATOR_INTERNAL_SKILLS));

    expect(error, error?.message).toBeNull();
    const leaks = (data ?? []).filter((r) => r.mcp_exposed);
    expect(
      leaks.map((r) => r.name),
      'Operator-internal skills (peer-comms primitives) leaked to MCP catalog',
    ).toEqual([]);
  });
});
