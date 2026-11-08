/**
 * The agent's day (2026-11-04): "what did Hermes do today?" has an answer —
 * per connected agent, calls, outcomes, skills, reports, steps — read by an
 * admin or the agent's owner, in the admin (the Activity sheet) and over MCP
 * (agent_day_report). The key id that made it possible is a column now, set
 * on every logged call, not a field buried in the arguments.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { PLATFORM_SKILLS } from '@/lib/platform-seeds';
import { ADMIN_ONLY_RPCS } from '@/lib/admin-only-rpcs';

const read = (p: string) => readFileSync(p, 'utf8');

describe("the agent's day", () => {
  it('the activity log carries the key: column, index, backfill, and every logged call sets it', () => {
    const sql = read('supabase/migrations/20261104210000_agent-day.sql');
    expect(sql).toMatch(/ALTER TABLE public\.agent_activity ADD COLUMN IF NOT EXISTS api_key_id uuid/);
    expect(sql).toMatch(/SET api_key_id = \(input ->> '_caller_api_key_id'\)::uuid\s+WHERE api_key_id IS NULL/);
    const exec = read('supabase/functions/_shared/execute/core.ts');
    expect(exec).toMatch(/\.\.\.\(activity\.api_key_id \? \{ api_key_id: activity\.api_key_id \} : \{\}\),/);
    // Every logActivity call site passes it — the three agent_type ones, the
    // effective one, and the MODULE_DISABLED refusal (2026-11-06).
    expect(exec.match(/api_key_id: caller_api_key_id \|\| null,/g)?.length).toBe(5);
  });

  it('agent_day is read by an admin or the owner, never anon; it is on the admin-RPC allowlist with its reason', () => {
    const sql = read('supabase/migrations/20261104210000_agent-day.sql');
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.agent_day\(p_peer_id uuid, p_since timestamptz DEFAULT NULL, p_limit integer DEFAULT 50\)/);
    expect(sql).toMatch(/auth\.role\(\) = 'service_role' OR public\.has_role\(auth\.uid\(\), 'admin'::public\.app_role\)\s+OR \(v_peer\.owner_user_id IS NOT NULL AND v_peer\.owner_user_id = auth\.uid\(\)\)/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.agent_day\(uuid, timestamptz, integer\) FROM PUBLIC, anon/);
    expect(sql).toMatch(/proof: a stranger should be refused/);
    expect(ADMIN_ONLY_RPCS.agent_day).toMatch(/ägare/);
  });

  it('the admin sheet and the MCP skill read the same function', () => {
    expect(read('src/hooks/useAgents.ts')).toMatch(/supabase\.rpc\('agent_day' as never, \{ p_peer_id: peerId, p_since: since, p_limit: 100 \} as never\)/);
    const table = read('src/components/admin/agents/ConnectedAgentsTable.tsx');
    expect(table).toMatch(/<AgentDaySheet agent=\{dayFor\} open=\{!!dayFor\}/);
    expect(table).toMatch(/onClick=\{\(\) => setDayFor\(a\)\}/);
    const seed = PLATFORM_SKILLS.find((s) => s.name === 'agent_day_report');
    expect(seed?.handler).toBe('internal:agent_day_report');
    expect(seed?.description).toMatch(/Use when:.*NOT for:/s);
    expect((seed?.tool_definition as { function: { parameters: { required: string[] } } }).function.parameters.required).toEqual(['agent']);
    const exec = read('supabase/functions/_shared/execute/core.ts');
    expect(exec).toMatch(/'internal:agent_day_report': \(/);
    expect(exec).toMatch(/supabase\.rpc\('agent_day', \{ p_peer_id: peers\[0\]\.id, p_since: since, p_limit:/);
  });
});
