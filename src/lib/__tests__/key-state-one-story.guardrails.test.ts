/**
 * A key has ONE state, and every page reads it the same way (2026-11-05).
 *
 * Peter revoked agents on /admin/agents at optic; Developer → MCP Keys then
 * still counted them as "Active Keys" with an "Expires 4 weeks ago" badge,
 * and its own Revoke DELETED the row while the Agents page's kept it. Two
 * pages, two stories about one key. The state now lives on the row
 * (`revoked_at`), is derived once (src/lib/key-state.ts), and both Revoke
 * buttons do the same thing through SECURITY DEFINER functions that update
 * key and agent together.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { keyState, isKeyActive } from '@/lib/key-state';

const read = (p: string) => readFileSync(resolve(__dirname, '../../..', p), 'utf8');

describe('keyState — one derivation', () => {
  const now = new Date('2026-11-05T12:00:00Z');
  it('revoked wins over everything, expired over active', () => {
    expect(keyState({ revoked_at: '2026-10-01T00:00:00Z', expires_at: '2099-01-01T00:00:00Z' }, now)).toBe('revoked');
    expect(keyState({ revoked_at: null, expires_at: '2026-10-08T00:00:00Z' }, now)).toBe('expired');
    expect(keyState({ revoked_at: null, expires_at: '2026-12-08T00:00:00Z' }, now)).toBe('active');
    expect(keyState({ revoked_at: null, expires_at: null }, now)).toBe('active');
    expect(keyState({}, now)).toBe('active');
  });
  it('isKeyActive is the gateway\'s question', () => {
    expect(isKeyActive({ revoked_at: null, expires_at: null }, now)).toBe(true);
    expect(isKeyActive({ revoked_at: '2026-10-01T00:00:00Z' }, now)).toBe(false);
    expect(isKeyActive({ expires_at: '2026-10-08T00:00:00Z' }, now)).toBe(false);
  });
});

describe('the state is written on the row, by both Revoke buttons', () => {
  const sql = read('supabase/migrations/20261105120000_a-key-has-one-state.sql');
  it('adds revoked_at and backfills it from already-revoked agents', () => {
    expect(sql).toMatch(/ALTER TABLE public\.api_keys\s+ADD COLUMN IF NOT EXISTS revoked_at timestamptz/);
    expect(sql).toMatch(/AND p\.status = 'revoked'\s+AND k\.revoked_at IS NULL/);
  });
  it('revoke_agent marks the key revoked, not merely expired', () => {
    const fn = sql.slice(sql.indexOf('FUNCTION public.revoke_agent'), sql.indexOf('FUNCTION public.revoke_api_key'));
    expect(fn).toMatch(/SET revoked_at = COALESCE\(revoked_at, now\(\)\),\s+expires_at = LEAST/);
  });
  it('revoke_api_key is the mirror: key revoked, every agent holding it revoked, guarded, not for anon', () => {
    const fn = sql.slice(sql.indexOf('FUNCTION public.revoke_api_key'));
    expect(fn).toMatch(/auth\.role\(\) = 'service_role' OR v_key\.created_by = auth\.uid\(\) OR can_access_module\(auth\.uid\(\), 'federation'\)/);
    expect(fn).toMatch(/UPDATE a2a_peers SET status = 'revoked', updated_at = now\(\)\s+WHERE api_key_id = p_key_id AND status <> 'revoked'/);
    expect(fn).toMatch(/REVOKE ALL ON FUNCTION public\.revoke_api_key\(uuid\) FROM PUBLIC, anon/);
  });
  it('the gateway refuses a revoked key whatever expires_at says', () => {
    const gw = read('supabase/functions/mcp-server/index.ts');
    expect(gw).toMatch(/select\("id, scopes, expires_at, revoked_at, created_by"\)\.eq\("key_hash", hash\)/);
    expect(gw.indexOf('if (data.revoked_at) {')).toBeLessThan(gw.indexOf('if (data.expires_at && new Date(data.expires_at) < new Date())'));
  });
});

describe('every page that lists a key reads the same state', () => {
  const hook = read('src/hooks/useApiKeys.ts');
  const dev = read('src/pages/admin/ApiKeysPage.tsx');
  const agents = read('src/components/admin/agents/ConnectedAgentsTable.tsx');
  const fed = read('src/components/admin/federation/McpCollaborators.tsx');

  it('the hook selects revoked_at; Revoke is the RPC (row kept), Delete is separate', () => {
    expect(hook).toMatch(/last_used_at, expires_at, revoked_at, created_at/);
    expect(hook).toMatch(/supabase\.rpc\('revoke_api_key' as never, \{ p_key_id: id \} as never\)/);
    const revokeFn = hook.slice(hook.indexOf('export function useRevokeApiKey'), hook.indexOf('export function useDeleteApiKey'));
    expect(revokeFn).not.toMatch(/\.delete\(\)/);
    expect(hook).toMatch(/export function useDeleteApiKey/);
    // Revoking a key changes the Agents page too — both lists refetch.
    expect(revokeFn).toMatch(/queryKey: \['connected-agents'\]/);
  });

  it('Developer → MCP Keys: active keys, then "Revoked or expired" folded; Revoke on active, Delete on the rest', () => {
    expect(dev).toMatch(/import \{ keyState, type KeyState \} from '@\/lib\/key-state'/);
    expect(dev).toMatch(/keys\.filter\(\(k\) => keyState\(k\) === 'active'\)/);
    expect(dev).toMatch(/Revoked or expired \(\{inactiveKeys\.length\}\)/);
    expect(dev).not.toMatch(/Active Keys/);
    // Delete is never offered for an active key; Revoke never for an inactive one.
    expect(dev).toMatch(/\{state === 'active' \? \(\s+<AlertDialog>[\s\S]*?Revoke Key[\s\S]*?\) : \(\s+<AlertDialog>[\s\S]*?Delete Key/);
    expect(dev).toMatch(/Revoked \{formatDistanceToNow\(new Date\(key\.revoked_at\)/);
  });

  it('/admin/agents: live agents, then "Revoked" folded — the same shape', () => {
    expect(agents).toMatch(/filter\(\(a\) => a\.status !== 'revoked'\)/);
    expect(agents).toMatch(/Revoked \(\{revokedAgents\.length\}\)/);
    expect(agents).toMatch(/<Collapsible open=\{showRevoked\}/);
    expect(agents).toMatch(/Developer → MCP Keys/);
  });

  it('Federation → MCP collaborators counts by the shared state and lists only live keys', () => {
    expect(fed).toMatch(/import \{ keyState \} from '@\/lib\/key-state'/);
    expect(fed).toMatch(/liveKeys\.map\(key =>/);
    expect(fed).toMatch(/revoked or expired/);
    expect(fed).not.toMatch(/isExpired/);
  });
});
