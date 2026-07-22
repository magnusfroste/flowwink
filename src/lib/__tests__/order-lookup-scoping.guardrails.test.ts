import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guardrail: lookup_order is identity-scoped and never crashes on a prefix.
 *
 * Reported 2026-07-22: a signed-in customer asked FlowChat about order
 * #ce8d1746 and got "there was an issue looking up your order". agent_activity
 * showed "operator does not exist: uuid ~~* unknown" — the handler did
 * `.ilike('id::text', …)`, which PostgREST sends as `id ~~* …` against a uuid
 * column, crashing EVERY prefix lookup. The account UI only ever shows the
 * 8-char prefix, so that was the one id form a real customer would paste.
 *
 * Fixing it also closed a scoping hole: the old handler queried all orders and
 * trusted a model-supplied email. Two rules now, keyed off the server-set
 * _public_chat flag (agent_type === 'chat'):
 *   • public chat  → only the caller's OWN orders (verified _caller_email);
 *     no email = a sign-in prompt, never a global lookup.
 *   • internal     → may look up any order, by id or email.
 */

const root = process.cwd();
const ae = readFileSync(join(root, 'supabase/functions/agent-execute/index.ts'), 'utf8');

/** The lookup_order handler body (from its comment marker to the closing brace). */
function handler(): string {
  const start = ae.indexOf('// check_order / lookup_order');
  expect(start, 'lookup_order handler not found').toBeGreaterThan(0);
  // Up to the next top-level function declaration.
  const end = ae.indexOf('\nfunction ', start);
  return ae.slice(start, end > 0 ? end : start + 3000);
}

describe('lookup_order scoping', () => {
  it('never does an ILIKE against the uuid id column (the crash)', () => {
    // Strip comments first — the handler quotes the old broken call to explain
    // itself, and that prose must not trip the check (same lesson as the
    // comms-send and brand guardrails).
    const h = handler()
      .split('\n')
      .filter((l) => !l.trimStart().startsWith('//'))
      .join('\n');
    expect(h, 'the uuid-ILIKE crash was reintroduced').not.toMatch(/ilike\(\s*['"]id::text/);
    // Prefix matching is done in JS over fetched rows instead.
    expect(h).toMatch(/\.startsWith\(ref\)/);
  });

  it('the gateway injects a server-set public-chat flag from agent_type', () => {
    // Model output can never set _public_chat — it is derived from the channel.
    expect(ae).toMatch(/_public_chat = agent_type === 'chat'/);
  });

  it('public chat with no verified email is refused, not globally looked up', () => {
    const h = handler();
    expect(h).toMatch(/isPublicChat && !callerEmail/);
    expect(h).toMatch(/Please sign in/);
  });

  it('a public-chat caller can never be scoped by a model-supplied email', () => {
    // scopeEmail may only take `email` when NOT public chat; a signed-in
    // customer is pinned to their verified _caller_email.
    const h = handler();
    expect(h).toMatch(/callerEmail \|\| \(!isPublicChat && typeof email === 'string'/);
  });

  it('the seed no longer tells the model to look orders up by a chat-typed email', () => {
    const seed = readFileSync(join(root, 'src/lib/modules/products-module.ts'), 'utf8');
    const block = seed.slice(seed.indexOf("name: 'lookup_order'"));
    expect(block).toMatch(/Never ask a chat visitor for their email/);
    expect(block).not.toMatch(/Look up order status by order ID or customer email\./);
  });
});
