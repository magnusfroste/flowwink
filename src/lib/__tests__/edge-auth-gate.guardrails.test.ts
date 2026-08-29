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
// NB: field-service-skill, sales-profile-setup and reconciliation were re-homed
// as internal: handlers inside agent-execute (edge-surface refactor B1a/B1b) —
// their gate is now agent-execute's own AUTH GATE, which this list still covers.
const MUST_BE_GATED = [
  'agent-execute',
  'comms-send',
  'flowpilot-lifecycle',
  'agent-operate',
  'federation-invite-peer',
  'subscriptions',
  'ai-task',
];

// Accept the shared helper OR a hand-rolled gate (service-role compare + a
// role/user resolution). Either proves the caller is authenticated in-body.
function isGated(src: string): boolean {
  if (/requireServiceOr(Role|Module|Staff)/.test(src)) return true;
  const comparesServiceKey =
    /===\s*serviceKey/.test(src) || /serviceKey\s*===/.test(src) ||
    /===\s*SERVICE_ROLE_KEY/.test(src);
  const resolvesIdentity =
    src.includes('auth.getUser') || src.includes('has_role') || src.includes('can_access_module') || src.includes('resolveCaller');
  return comparesServiceKey && resolvesIdentity;
}

describe('Privileged edge functions authenticate the caller (edge-auth gate)', () => {
  it('the shared edge-auth helper exists', () => {
    const helper = readFileSync(join(FUNCTIONS_DIR, '_shared', 'edge-auth.ts'), 'utf-8');
    expect(helper).toContain('export async function requireServiceOrRole');
    // #102: the matrix variants — module-gated and staff-gated — must exist too.
    expect(helper).toContain('export async function requireServiceOrModule');
    expect(helper).toContain('export async function requireServiceOrStaff');
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

// ─── Hjälparen, körd ────────────────────────────────────────────────────────
//
// Svepet ovan bevisar att grinden ANROPAS. Mutationsrevisionen 2026-08-30
// visade vad det inte räcker till: `if (false && !auth.authorized)` i en
// anropare lämnade alla åtta påståenden gröna. Så här körs beslutet, och
// anroparens nekan-gren granskas för kortslutning.
describe('edge-auth beslutar på riktigt', () => {
  const KEYS = { service: 'service-key', anon: 'anon-key', publishable: 'pub-key' };

  const withDenoEnv = async <T>(fn: () => Promise<T>): Promise<T> => {
    const prev = (globalThis as Record<string, unknown>).Deno;
    (globalThis as Record<string, unknown>).Deno = {
      env: {
        get: (k: string) =>
          k === 'SUPABASE_SERVICE_ROLE_KEY' ? KEYS.service
          : k === 'SUPABASE_ANON_KEY' ? KEYS.anon
          : k === 'SUPABASE_PUBLISHABLE_KEY' ? KEYS.publishable
          : undefined,
      },
    };
    try { return await fn(); } finally { (globalThis as Record<string, unknown>).Deno = prev; }
  };

  const reqWith = (token?: string) =>
    new Request('https://example.test/', {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });

  const fakeSupabase = (opts: { user?: { id: string } | null; rpc?: unknown }) => ({
    auth: { getUser: async () => ({ data: opts.user ? { user: opts.user } : null }) },
    rpc: async () => ({ data: opts.rpc ?? null }),
  });

  it('service-nyckeln auktoriseras, anon-nyckeln nekas', async () => {
    await withDenoEnv(async () => {
      const { requireServiceOrRole } = await import(
        '../../../supabase/functions/_shared/edge-auth.ts'
      );
      const sb = fakeSupabase({ user: null }) as never;
      expect((await requireServiceOrRole(reqWith(KEYS.service), sb)).authorized).toBe(true);
      expect((await requireServiceOrRole(reqWith(KEYS.anon), sb)).authorized).toBe(false);
      expect((await requireServiceOrRole(reqWith(KEYS.publishable), sb)).authorized).toBe(false);
      expect((await requireServiceOrRole(reqWith(), sb)).authorized).toBe(false);
    });
  });

  it('en inloggad utan rollen nekas — rollen avgör, inte inloggningen', async () => {
    await withDenoEnv(async () => {
      const { requireServiceOrRole } = await import(
        '../../../supabase/functions/_shared/edge-auth.ts'
      );
      const withRole = fakeSupabase({ user: { id: 'u1' }, rpc: true }) as never;
      const without = fakeSupabase({ user: { id: 'u1' }, rpc: false }) as never;
      const unknownRpc = fakeSupabase({ user: { id: 'u1' }, rpc: null }) as never;
      expect((await requireServiceOrRole(reqWith('jwt'), withRole)).authorized).toBe(true);
      expect((await requireServiceOrRole(reqWith('jwt'), without)).authorized).toBe(false);
      // Ett misslyckat rpc ger null. Null får aldrig läsas som ja.
      expect((await requireServiceOrRole(reqWith('jwt'), unknownRpc)).authorized).toBe(false);
    });
  });

  it('modulgrinden kräver ett strikt true från matrisen', async () => {
    await withDenoEnv(async () => {
      const { requireServiceOrModule } = await import(
        '../../../supabase/functions/_shared/edge-auth.ts'
      );
      const granted = fakeSupabase({ user: { id: 'u1' }, rpc: true }) as never;
      const denied = fakeSupabase({ user: { id: 'u1' }, rpc: false }) as never;
      const failed = fakeSupabase({ user: { id: 'u1' }, rpc: null }) as never;
      expect((await requireServiceOrModule(reqWith('jwt'), granted, 'crm')).authorized).toBe(true);
      expect((await requireServiceOrModule(reqWith('jwt'), denied, 'crm')).authorized).toBe(false);
      expect((await requireServiceOrModule(reqWith('jwt'), failed, 'crm')).authorized).toBe(false);
    });
  });

  it('ingen anropares nekan-gren är kortsluten till död kod', () => {
    // `if (false && !auth.authorized)` var mutationen som slapp igenom.
    for (const fn of MUST_BE_GATED) {
      const src = readFileSync(join(FUNCTIONS_DIR, fn, 'index.ts'), 'utf-8');
      expect(src, `${fn} har en kortsluten grind`).not.toMatch(
        /if\s*\(\s*(false|0)\s*&&/,
      );
      expect(src, `${fn} har en bortkommenterad grind`).not.toMatch(
        /\/\/\s*if\s*\(!\s*\w+\.authorized/,
      );
    }
  });
});
