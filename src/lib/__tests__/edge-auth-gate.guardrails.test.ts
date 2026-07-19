/**
 * Guardrail: privileged, service-role edge functions must authenticate the
 * caller in-body.
 *
 * These functions run with the service-role client (RLS off) and are deployed
 * --no-verify-jwt, so without an in-body gate they are open, RLS-exempt,
 * internet-reachable endpoints. A 2026-07 security audit found six such
 * functions (agent-execute could run ANY skill unauthenticated; federation-
 * invite-peer minted admin MCP keys anonymously). This test asserts each stays
 * gated — either via the shared _shared/edge-auth.ts helper or a verified
 * inline check — so a refactor can't silently drop the gate.
 *
 * NB: this is NOT "add auth to every function". Genuinely public functions
 * (get-page, content-api, stripe-webhook, track-page-view, public form/
 * newsletter/booking submits) must stay open and are deliberately excluded.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const FUNCTIONS_DIR = join(process.cwd(), 'supabase', 'functions');

// Privileged functions that MUST authenticate the caller in-body.
// NB: field-service-skill and sales-profile-setup were re-homed as internal:
// handlers inside agent-execute (edge-surface refactor B1a) — their gate is
// now agent-execute's own AUTH GATE, which this list still covers.
const MUST_BE_GATED = [
  'agent-execute',
  'comms-send',
  'agent-operate',
  'federation-invite-peer',
  'reconciliation',
  'subscriptions',
  'ai-task',
];

// Accept the shared helper OR a hand-rolled gate (service-role compare + a
// role/user resolution). Either proves the caller is authenticated in-body.
function isGated(src: string): boolean {
  if (src.includes('requireServiceOrRole')) return true;
  const comparesServiceKey =
    /===\s*serviceKey/.test(src) || /serviceKey\s*===/.test(src) ||
    /===\s*SERVICE_ROLE_KEY/.test(src);
  const resolvesIdentity =
    src.includes('auth.getUser') || src.includes('has_role') || src.includes('resolveCaller');
  return comparesServiceKey && resolvesIdentity;
}

describe('Privileged edge functions authenticate the caller (edge-auth gate)', () => {
  it('the shared edge-auth helper exists', () => {
    const helper = readFileSync(join(FUNCTIONS_DIR, '_shared', 'edge-auth.ts'), 'utf-8');
    expect(helper).toContain('export async function requireServiceOrRole');
    expect(helper).toContain('SUPABASE_SERVICE_ROLE_KEY');
  });

  for (const fn of MUST_BE_GATED) {
    it(`[${fn}] gates the caller in-body (service key or role)`, () => {
      const src = readFileSync(join(FUNCTIONS_DIR, fn, 'index.ts'), 'utf-8');
      expect(
        isGated(src),
        `${fn}/index.ts must authenticate the caller in-body — import ` +
          `requireServiceOrRole from _shared/edge-auth.ts (accepts the service ` +
          `role key or an admin JWT, rejects anon), or keep an equivalent inline ` +
          `gate. It runs privileged work with the service-role client while being ` +
          `deployed --no-verify-jwt, so dropping the gate reopens an unauthenticated ` +
          `RLS-exempt endpoint.`,
      ).toBe(true);
    });
  }
});
