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
 * Source of the exception: the seed's `mcp_exposed: false` (SkillSeed), honoured
 * by every writer — browser bootstrap, sync-skills.ts, sync_skills_from_code.
 * This test reads the live instance to prove the writers kept their word.
 */
import { describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { describeIfServiceKey } from '@/test/live-db';

// No instance default — unset means the suite skips (describeIfServiceKey).
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://unconfigured-live-db.invalid';
// agent_skills is not anon-readable since the matrix/anon hardening reached
// the fleet (2026-09-06, 42501 "permission denied for table agent_skills") — this
// suite reads it, so it needs the service key, exactly as live-db.ts says.
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';

/** Skills that are FlowPilot-internal and intentionally NOT MCP-exposed. */
const OPERATOR_INTERNAL_SKILLS = new Set([
  'a2a_chat',
  'a2a_request',
  'dispatch_claw_mission',
  // openclaw_start_session/end_session never existed as seeds — the QA
  // session skills are start_qa_session/end_qa_session and ARE for external
  // operators (OpenClaw files findings through them).
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

// Module-level client: a placeholder key keeps the import from throwing when
// the suite is skipped for lack of a service key (createClient refuses '').
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY || 'no-service-key-suite-skipped');

describeIfServiceKey('MCP catalog exposure invariants (live DB)', () => {
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
  }, 20_000);

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
  }, 20_000);

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
  }, 20_000);
});
