import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AGENT_CLIENTS } from '@/lib/agent-clients';
import { MISSION_TEMPLATES } from '@/lib/agent-missions';

/**
 * An agent is a principal with an owner.
 *
 * Peter's Hermes called itself a nameless "external agent": the name existed on
 * the peer row, but the briefing told every connected agent it was FlowPilot,
 * attribution went to the admin who clicked "generate", and nothing held the
 * agent to the person behind it. These guards keep the model: one key, one
 * agent, one owner — the gateway acts as the owner and refuses what the owner
 * cannot do; the UI shows "Hermes (Peter)"; a colleague connects their own.
 */

const root = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const migration = read('supabase/migrations/20261007180000_agenten-har-en-agare.sql');
const gateway = read('supabase/functions/mcp-server/index.ts');
const invite = read('supabase/functions/federation-invite-peer/index.ts');

describe('the agent has an owner', () => {
  it('the peer row carries the owner and the client, and owners read their own', () => {
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS owner_user_id uuid/);
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS client_kind text/);
    expect(migration).toMatch(/Owners see their own agents[\s\S]*USING \(owner_user_id = auth\.uid\(\)\)/);
    expect(migration).toMatch(/revoke_agent\(p_peer_id uuid\)/);
    expect(migration).toMatch(/v_peer\.owner_user_id = auth\.uid\(\) OR can_access_module\(auth\.uid\(\), 'federation'\)/);
    expect(migration).not.toMatch(/has_role\(/);
  });

  it('the gateway acts AS the owner and holds every call to the owner\'s module access', () => {
    expect(gateway).toMatch(/c\.set\("apiKeyCreatedBy" as any, peerIdentity\.ownerUserId \?\? auth\.createdBy\)/);
    expect(gateway).toMatch(/async function ownerMayRun\(/);
    // every path that executes a skill passes the gate first
    const execs = gateway.match(/await executeSkill\(/g) ?? [];
    const gates = gateway.match(/await ownerMayRun\(/g) ?? [];
    expect(execs.length).toBeGreaterThanOrEqual(4);
    expect(gates.length).toBeGreaterThanOrEqual(execs.length);
    // same fail-closed rule as the executor: platform / unmapped skills are admin-only
    expect(gateway).toMatch(/if \(!mod \|\| mod === "platform"\) return \{ ok: false/);
    // discovery tells the same truth as execution
    expect(gateway).toMatch(/async function filterByOwner</);
    expect((gateway.match(/await filterByOwner\(/g) ?? []).length).toBeGreaterThanOrEqual(6);
  });

  it('the briefing tells the agent who it is', () => {
    expect(gateway).toMatch(/async function describeCaller\(/);
    expect(gateway).toMatch(/\n\s+you,\n\s+operator,/);
    expect(gateway).toMatch(/sign_as:/);
  });

  it('a colleague may mint their own agent, as its owner, clamped to their modules', () => {
    expect(invite).toMatch(/let callerUserId: string \| null = null;/);
    expect(invite).toMatch(/if \(!inviter && !isAdminCaller && !isServiceCaller && !callerUserId\)/);
    expect(invite).toMatch(/else if \(callerUserId\) ownerUserId = callerUserId;/);
    expect(invite).toMatch(/if \(ownerUserId && !ownerIsAdmin\) \{[\s\S]*can_access_module/);
    // the ceiling is NOT written as module tokens (the heuristic classifier hides skills); the gateway enforces it
    expect(invite).not.toMatch(/grantedGroups = ownerModules/);
    expect(invite).toMatch(/You have no module access to delegate/);
    expect(invite).toMatch(/created_by: ownerUserId,/);
    expect(invite).toMatch(/owner_user_id: ownerUserId,\n\s+client_kind: body\.client_kind \?\? null,/);
  });

  it('the key may also ride in the URL for clients that cannot send a header', () => {
    expect(gateway).toMatch(/queryKey: string \| null = null/);
    expect(gateway).toMatch(/new URL\(c\.req\.url\)\.searchParams\.get\("key"\)/);
  });
});

describe('connecting an agent is three choices', () => {
  it('every listed client has a snippet that carries URL and key together', () => {
    const url = 'https://x.supabase.co/functions/v1/mcp-server?mode=dispatch';
    const key = 'fw_test_key';
    for (const c of AGENT_CLIENTS) {
      const s = c.snippet(url, key);
      expect(s, c.id).toContain('x.supabase.co/functions/v1/mcp-server');
      expect(s, c.id).toContain(key);
    }
    expect(AGENT_CLIENTS.map((c) => c.id)).toEqual(expect.arrayContaining(['claude', 'chatgpt', 'cursor', 'opencode', 'gemini', 'copilot', 'hermes']));
  });

  it('the simple choices map onto real missions; the templates live in a lib, not a component', () => {
    for (const id of ['full-operator', 'qa-sweep', 'growth-operator', 'commerce-operator', 'hr-operator', 'finance-operator']) {
      expect(MISSION_TEMPLATES.some((m) => m.id === id), id).toBe(true);
    }
    expect(read('src/components/admin/federation/AgentInvites.tsx')).not.toMatch(/^const MISSION_TEMPLATES/m);
  });

  it('both doors exist: /admin/agents (gated like federation) and /account/agents for staff', () => {
    const app = read('src/App.tsx');
    expect(app).toMatch(/path: "\/admin\/agents", element: <AgentsPage \/>/);
    expect(app).toMatch(/path: "agents", element: <MyAgentsPage \/>/);
    expect(read('src/hooks/useModules.tsx')).toMatch(/'\/admin\/agents': 'federation'/);
    expect(read('src/components/admin/adminNavigation.ts')).toMatch(/name: "Agents", href: "\/admin\/agents"/);
    expect(read('src/pages/account/AccountLayout.tsx')).toMatch(/rolesReady && roles\.length > 0 \? agentsNav : \[\]/);
  });
});
