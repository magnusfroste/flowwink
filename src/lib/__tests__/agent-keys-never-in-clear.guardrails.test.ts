import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * An agent's key exists in one place: the response that minted it.
 *
 * The 2026-07-09 migration nulled api_keys.key_raw and called it "never
 * populated" — but federation-invite-peer kept writing it, and a2a_peers
 * .mcp_api_key too, so every agent invited since July had its key in clear
 * text, and #649's owner RLS made the row readable to the owner. A guard that
 * named the file that bit us would have missed the second column; this one
 * scans every edge function for the SHAPE (a write to a raw-key column) and
 * the schema for the column itself.
 */

const root = join(__dirname, '../../..');
const fnRoot = join(root, 'supabase/functions');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|js)$/.test(name) && !/\.test\./.test(name)) out.push(p);
  }
  return out;
}
const fnFiles = walk(fnRoot);
const rel = (p: string) => p.slice(root.length + 1);

/** The outbound leg to OpenClaw must hand the Claw a callback key in the mission prompt — the one sanctioned raw store. */
const RAW_KEY_WRITERS_ALLOWED = new Set(['supabase/functions/openclaw-responses/index.ts']);

describe('agent keys are never at rest in clear text', () => {
  it('no edge function writes api_keys.key_raw, and the column is gone from the types', () => {
    const offenders = fnFiles.filter((p) => /\bkey_raw\b/.test(readFileSync(p, 'utf8'))).map(rel);
    expect(offenders, 'key_raw is written here — the column was dropped 2026-10-08').toEqual([]);
    expect(read('src/integrations/supabase/types.ts')).not.toMatch(/\bkey_raw\b/);
    expect(read('supabase/migrations/20261008120000_nyckeln-ligger-aldrig-i-klartext.sql')).toMatch(/DROP COLUMN IF EXISTS key_raw/);
  });

  it('only the OpenClaw dispatch path writes a2a_peers.mcp_api_key', () => {
    // The shape of a write: an .insert({…}) / .update({…}) whose object names the
    // column. (The invite RESPONSE also carries `mcp_api_key:` — to the agent, once;
    // that is the point, not a store.)
    const writeBlocks = (src: string) => [...src.matchAll(/\.(insert|update)\(\s*\{[\s\S]*?\}\s*\)/g)].map((m) => m[0]);
    const writers = fnFiles
      .filter((p) => writeBlocks(readFileSync(p, 'utf8')).some((b) => /\b(mcp_api_key|key_raw)\s*:/.test(b)))
      .map(rel)
      .filter((p) => !RAW_KEY_WRITERS_ALLOWED.has(p));
    expect(writers, 'a raw agent key is being stored on the peer row').toEqual([]);
    // …and nothing compares a presented token against that column (raw-key equality auth).
    const comparers = fnFiles.filter((p) => /\.eq\(["']mcp_api_key["']/.test(readFileSync(p, 'utf8'))).map(rel);
    expect(comparers).toEqual([]);
  });

  it('the invite path returns the key once and never stores it', () => {
    const invite = read('supabase/functions/federation-invite-peer/index.ts');
    expect(invite).toMatch(/mcp_api_key: mcpKey,\s*\n\s*mcp_endpoint/); // in the response…
    expect(invite).not.toMatch(/key_raw/); // …not in api_keys
    const peerInsert = invite.slice(invite.indexOf('.from("a2a_peers")\n      .insert('), invite.indexOf('await supabase.from("peer_invitations")'));
    expect(peerInsert).not.toMatch(/mcp_api_key/); // …not on the peer row
  });

  it('the OpenClaw callback key is linked to its peer and replaces the old one', () => {
    const claw = read('supabase/functions/openclaw-responses/index.ts');
    expect(claw).toMatch(/\.update\(\{ mcp_api_key: rawKey, api_key_id: newKey\.id \}\)/);
    expect(claw).toMatch(/peer\.api_key_id !== newKey\.id/);
  });
});

describe('a key in the URL is the exception, not the rule', () => {
  const gateway = read('supabase/functions/mcp-server/index.ts');
  const invite = read('supabase/functions/federation-invite-peer/index.ts');

  it('the gateway accepts ?key= only for clients that cannot send a header, and says why otherwise', () => {
    expect(gateway).toMatch(/const QUERY_KEY_CLIENTS = new Set\(\["chatgpt"\]\)/);
    expect(gateway).toMatch(/if \(viaQuery\) \{[\s\S]*QUERY_KEY_CLIENTS\.has\(String\(peer\.client_kind \?\? ""\)\)[\s\S]*queryKeyRefused: true/);
    expect(gateway).toMatch(/auth\.queryKeyRefused\)[\s\S]*Key must be sent as a header/);
  });

  it('keys minted for such clients get a lifetime', () => {
    expect(invite).toMatch(/const QUERY_KEY_CLIENTS = new Set\(\["chatgpt"\]\)/);
    expect(invite).toMatch(/expires_at: expiresAt,/);
    expect(read('src/lib/agent-clients.ts')).toMatch(/expire after 90 days/);
  });
});

describe('an agent without an owner is named as such and can be given one', () => {
  it('set_agent_owner moves the peer owner and the key creator together, gated on the Agents module', () => {
    const m = read('supabase/migrations/20261008120000_nyckeln-ligger-aldrig-i-klartext.sql');
    expect(m).toMatch(/FUNCTION public\.set_agent_owner\(p_peer_id uuid, p_owner_user_id uuid\)/);
    expect(m).toMatch(/can_access_module\(auth\.uid\(\), 'federation'\)/);
    expect(m).toMatch(/UPDATE a2a_peers SET owner_user_id = p_owner_user_id/);
    expect(m).toMatch(/UPDATE api_keys SET created_by = p_owner_user_id/);
  });

  it('the Agents table says "no owner — full reach", offers the picker, and flags idle agents', () => {
    const table = read('src/components/admin/agents/ConnectedAgentsTable.tsx');
    expect(table).toMatch(/no owner — full reach/);
    expect(table).toMatch(/<OwnerPicker agent=\{a\} \/>/);
    expect(table).toMatch(/idleDays\(a\)/);
    expect(read('src/lib/agent-idle.ts')).toMatch(/IDLE_AFTER_DAYS = 30/);
    expect(read('src/hooks/useAgents.ts')).toMatch(/rpc\('set_agent_owner' as never/);
  });

  it('fleet:status measures clear-text keys, idle agents and functions deployed but undeclared', () => {
    const fleet = read('scripts/fleet-status.ts');
    expect(fleet).toMatch(/plaintextKeys/);
    expect(fleet).toMatch(/idleAgents/);
    expect(fleet).toMatch(/api\.supabase\.com\/v1\/projects\/\$\{ref\}\/functions/);
    expect(fleet).toMatch(/declaredFns/);
  });
});
