/**
 * Guardrails: Retrieval Engine confidentiality invariants
 * (docs/architecture/retrieval-engine.md §4 and §6).
 *
 * The engine's security model is STRUCTURAL: knowledge_chunks carries RLS on
 * visibility classes and search_knowledge_chunks is SECURITY INVOKER, so a
 * consumer can only retrieve what its own credentials can see ("retrieval
 * runs with the caller's eyes"). These tripwires lock the seams that would
 * silently break that model:
 *
 *  1. The RPC flipping to SECURITY DEFINER (bypasses RLS → anon reads
 *     internal wiki/documents chunks).
 *  2. RLS being dropped from the migration, or the anon policy widening
 *     beyond visibility='public'.
 *  3. A consumer calling the search RPC through the service-role client
 *     (bypasses RLS the other way around).
 *
 * Live rung-boundary tests (seeded fixture, anon vs staff caller) live in
 * scripts/smoke/retrieval-leak.sql — run against any instance. These static
 * tripwires run in CI where no database exists.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf-8');

const MIGRATION = 'supabase/migrations/20260713150000_retrieval-engine-m1.sql';

describe('Retrieval Engine confidentiality guardrails', () => {
  const migration = read(MIGRATION);

  it('search_knowledge_chunks is SECURITY INVOKER (never DEFINER)', () => {
    const fn = migration.slice(migration.indexOf('FUNCTION public.search_knowledge_chunks'));
    const body = fn.slice(0, fn.indexOf('$$;'));
    expect(body).toContain('SECURITY INVOKER');
    expect(body).not.toContain('SECURITY DEFINER');
  });

  it('knowledge_chunks has RLS enabled', () => {
    expect(migration).toMatch(
      /ALTER TABLE public\.knowledge_chunks ENABLE ROW LEVEL SECURITY/,
    );
  });

  it("the anonymous-readable policy is restricted to visibility = 'public'", () => {
    const policyStart = migration.indexOf('CREATE POLICY "Anyone can read public chunks"');
    expect(policyStart).toBeGreaterThan(-1);
    const policy = migration.slice(policyStart, migration.indexOf(';', policyStart));
    expect(policy).toContain("visibility = 'public'");
    // The public policy must not reference 'internal' in any form.
    expect(policy).not.toContain('internal');
  });

  it('internal chunks require an internal staff role, never plain authenticated', () => {
    const policyStart = migration.indexOf('CREATE POLICY "Internal staff can read internal chunks"');
    expect(policyStart).toBeGreaterThan(-1);
    const policy = migration.slice(policyStart, migration.indexOf(';', policyStart));
    // Role check must go through user_roles (explicit staff allowlist).
    expect(policy).toContain('public.user_roles');
    expect(policy).toContain('ur.role IN');
    // 'customer' is an authenticated role — it must NOT grant internal reads.
    expect(policy).not.toContain("'customer'");
  });

  it('the retrieval query path never touches the service-role client', () => {
    const lib = read('supabase/functions/_shared/retrieval/index.ts');
    expect(lib).not.toMatch(/SERVICE_ROLE|getServiceClient/);
  });

  it('docs-chat SEARCHES with the anon client (caller’s eyes) — service is config-only', () => {
    const fn = read('supabase/functions/docs-chat/index.ts');
    // The chunk search must run on the anon client…
    expect(fn).toMatch(/retrieve\(\s*getAnonClient\(\)/);
    expect(fn).not.toMatch(/retrieve\(\s*getServiceClient/);
    // …and the service client may appear ONLY as the embedQuery config source.
    const serviceUses = fn.match(/getServiceClient\(\)/g) ?? [];
    const embedConfigUses = fn.match(/embedQuery\(\s*getServiceClient\(\)/g) ?? [];
    expect(serviceUses.length).toBe(embedConfigUses.length);
  });

  it('structured-data tables are not chunk sources (two-lane rule)', () => {
    const indexer = read('supabase/functions/_shared/retrieval/indexer.ts');
    const sourcesMatch = indexer.match(/CHUNK_SOURCES = \[([^\]]+)\]/);
    expect(sourcesMatch).not.toBeNull();
    const sources = sourcesMatch![1];
    for (const forbidden of ['flowtable', 'orders', 'invoices', 'leads', 'deals']) {
      expect(sources).not.toContain(forbidden);
    }
  });
});
