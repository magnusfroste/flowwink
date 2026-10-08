import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * One protocol, both directions: MCP.
 *
 * The A2A transport — peer-to-peer chat and requests between instances with
 * their own tokens, a discovery card and a connection ledger — was a second
 * protocol for what MCP already does, and complex enough to scare people at
 * the door. Removed 2026-10-08. a2a_peers stays as the agent register and
 * a2a_activity as OpenClaw's exchange log; these guards keep the transport gone.
 */

const root = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('the A2A transport is retired', () => {
  it('the a2a and agent-card functions are gone, from disk and from the registry', () => {
    expect(existsSync(join(root, 'supabase/functions/a2a'))).toBe(false);
    expect(existsSync(join(root, 'supabase/functions/agent-card'))).toBe(false);
    const registry = read('src/lib/edge-function-registry.ts');
    expect(registry).not.toMatch(/'a2a'|'agent-card'/);
    expect(read('supabase/config.toml')).not.toMatch(/\[functions\.(a2a|agent-card)\]/);
  });

  it('no skill rides the A2A transport', () => {
    const mod = read('src/lib/modules/federation-module.ts');
    expect(mod).not.toMatch(/a2a_chat|a2a_request/);
    const executor = read('supabase/functions/agent-execute/index.ts');
    expect(executor).not.toMatch(/handler\.startsWith\('a2a:'\)/);
    expect(executor).not.toMatch(/functions\/v1\/a2a\//);
  });

  it('the connection ledger is dropped and nothing reads or writes it', () => {
    expect(read('supabase/migrations/20261008090000_a2a-transporten-gar-mcp-stannar.sql')).toMatch(/DROP TABLE IF EXISTS public\.federation_connections/);
    for (const f of ['supabase/functions/mcp-server/index.ts', 'supabase/functions/federation-invite-peer/index.ts', 'supabase/functions/agent-execute/index.ts']) {
      expect(read(f), f).not.toMatch(/federation_connections/);
    }
  });

  it('the legacy page is gone and its route redirects to Agents', () => {
    expect(existsSync(join(root, 'src/pages/admin/FederationPage.tsx'))).toBe(false);
    for (const f of ['A2ATestChat', 'A2AActivityLog', 'PeerChannelsInline', 'PeerConnectionsTab', 'InvitationTree', 'AgentInvites']) {
      expect(existsSync(join(root, `src/components/admin/federation/${f}.tsx`)), f).toBe(false);
    }
    expect(read('src/App.tsx')).toMatch(/path: "\/admin\/federation", element: <Navigate to="\/admin\/agents" replace \/>/);
    expect(read('src/lib/admin-route-access.ts')).toMatch(/'\/admin\/federation': \{ redirect: true \}/);
  });

  it('the agent register stays on the wire', () => {
    expect(read('src/hooks/useAgents.ts')).toMatch(/from\('a2a_peers'\)/);
    expect(read('supabase/functions/mcp-server/index.ts')).toMatch(/from\("a2a_peers"\)/);
  });
});
