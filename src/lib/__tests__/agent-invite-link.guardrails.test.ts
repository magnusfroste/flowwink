import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * An invited agent's very first instruction is "read flowwink://mission". That
 * failed for every invite ever issued.
 *
 * federation-invite-peer minted the key, created the peer, and recorded the link
 * in the (since retired) connection ledger — but left a2a_peers.api_key_id NULL. The MCP
 * gateway resolves a caller to its peer through exactly that column, found
 * nothing, and auto-registered a SECOND peer named after the key. The invited
 * peer kept the mission and no key; the duplicate got the key and no mission.
 * Both rows looked fine on their own, and the agent was told it had no mission.
 */
describe('an invite links the key to the peer it was minted for', () => {
  const src = readFileSync(
    resolve(__dirname, '../../../supabase/functions/federation-invite-peer/index.ts'),
    'utf-8',
  );
  // Slice from the comment that marks the peer insert to the next statement —
  // anchoring on the exact `.insert(` whitespace made this guard fail against
  // the very code it was written to protect.
  const peerInsert = src.slice(
    src.indexOf('// Create the new peer'),
    // End on the next statement after the peer insert (the connection ledger
    // that used to follow it went with the A2A transport, 2026-10-08).
    src.indexOf('await supabase.from("peer_invitations")'),
  );

  it('sets api_key_id on the peer row', () => {
    expect(
      peerInsert.includes('api_key_id: apiKey.id'),
      'without this the gateway cannot find the invited peer and creates a duplicate — ' +
        'the mission ends up on a peer that has no key',
    ).toBe(true);
  });

  it('still records the raw key for display', () => {
    expect(peerInsert).toContain('mcp_api_key');
  });

  it('the gateway looks the peer up by that same column', () => {
    const gw = readFileSync(
      resolve(__dirname, '../../../supabase/functions/mcp-server/index.ts'), 'utf-8');
    expect(gw).toContain('.eq("api_key_id", apiKeyId)');
  });
});
