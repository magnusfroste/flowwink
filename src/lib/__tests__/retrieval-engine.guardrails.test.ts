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
 *     (bypasses RLS the other way around). ONE named exception exists:
 *     retrieveVendorDocs (_shared/retrieval/vendor-docs.ts) — the /docs
 *     surface serving FlowWink's own docs, with the source list pinned in
 *     code the caller can't reach. Its locks are below.
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

  it('docs-chat grounds ONLY through the named vendor-docs exception', () => {
    // docs-chat is the sanctioned public reader of docs_pages (the docs are
    // public on GitHub — 'internal' is audience routing, not secrecy). It may
    // NOT call retrieve() itself: its privileged search travels through
    // retrieveVendorDocs, whose source pin it cannot widen. History of this
    // seam: 'public' chunks leaked via anon RPC (#214) → tier fix starved the
    // anon-eyes search here and the chat answered ungrounded fleet-wide (#95).
    const fn = read('supabase/functions/docs-chat/index.ts');
    expect(fn).toMatch(/retrieveVendorDocs\(\s*getServiceClient\(\)/);
    expect(fn, 'docs-chat must not call retrieve() directly').not.toMatch(/[^A-Za-z]retrieve\(/);
    // The service client may appear ONLY for: config reads (embedQuery,
    // resolveAiConfig), the vendor-docs retrieval itself, and the public-AI
    // rate counter (publicAiLimit — it reads the dial and counts, never content).
    const serviceUses = fn.match(/getServiceClient\(\)/g) ?? [];
    const sanctionedUses = fn.match(/(?:embedQuery|resolveAiConfig|retrieveVendorDocs)\(\s*getServiceClient\(\)|publicAiLimit\(req,\s*getServiceClient\(\)/g) ?? [];
    expect(serviceUses.length).toBe(sanctionedUses.length);
  });

  it('the vendor-docs exception is pinned to docs_pages and cannot be widened by callers', () => {
    const helper = read('supabase/functions/_shared/retrieval/vendor-docs.ts');
    // The pin is a module-local constant containing exactly one source…
    expect(helper).toMatch(/const VENDOR_DOCS_SOURCES = \['docs_pages'\]/);
    // …the options type must not grow a `sources` escape hatch…
    const iface = helper.match(/export interface VendorDocsQuery \{[\s\S]*?\}/)?.[0] ?? '';
    expect(iface, 'VendorDocsQuery must exist').not.toBe('');
    expect(iface).not.toMatch(/sources\??:/);
    // …and the retrieve call must use the pin, not a parameter.
    expect(helper).toMatch(/sources:\s*VENDOR_DOCS_SOURCES/);
  });

  it('no customer-facing surface imports the vendor-docs exception', () => {
    // The exception exists FOR the /docs surface. The customer-facing chats
    // and the agent gateway must keep grounding with the caller's eyes.
    for (const surface of [
      'supabase/functions/chat-completion/index.ts',
      'supabase/functions/workspace-chat/index.ts',
      'supabase/functions/_shared/execute/core.ts',
    ]) {
      expect(read(surface), `${surface} must not use retrieveVendorDocs`).not.toContain('retrieveVendorDocs');
    }
  });

  it('chat-completion SEARCHES with the anon client (rung 0), never service', () => {
    const fn = read('supabase/functions/chat-completion/index.ts');
    expect(fn).toMatch(/retrieve\(\s*getAnonClient\(\)/);
    expect(fn).not.toMatch(/retrieve\(\s*(supabase|getServiceClient)/);
  });

  it('Flowwork retrieves chunks with the CALLER’s client, not admin', () => {
    const fn = read('supabase/functions/workspace-chat/index.ts');
    expect(fn).toContain('knowledgeChunksSource');
    expect(fn).toMatch(/userClient:\s*supabaseUser/);
  });

  it('the chunk-lane source resolves through the caller client', () => {
    const src = read('supabase/functions/_shared/retrieval/sources.ts');
    expect(src).toMatch(/retrieve\(\s*userClient/);
    expect(src).not.toMatch(/retrieve\(\s*service/);
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

describe('Retrieval Engine fusion guardrails (semantic weighting)', () => {
  // The latest CREATE OR REPLACE of the RPC (semantic-weight migration) is the
  // authoritative one applied last; assert its shape.
  const migration = read('supabase/migrations/20260714170000_retrieval-semantic-weight.sql');

  it('the fusion is weighted, not plain equal-weight RRF', () => {
    // semantic term × semantic_weight, text term × (1 - semantic_weight).
    expect(migration).toMatch(/semantic_weight\s+double precision DEFAULT/);
    expect(migration).toMatch(/semantic_weight\s*\*\s*COALESCE\(1\.0 \/ \(rrf_k \+ s\.rank\)/);
    expect(migration).toMatch(/\(1 - semantic_weight\)\s*\*\s*COALESCE\(1\.0 \/ \(rrf_k \+ t\.rank\)/);
  });

  it('near-ties break toward the semantically-closer chunk', () => {
    expect(migration).toMatch(/ORDER BY f\.hybrid_score DESC, f\.semantic_score DESC/);
  });

  it('stays SECURITY INVOKER (caller-eyes preserved through the change)', () => {
    const fn = migration.slice(migration.indexOf('FUNCTION public.search_knowledge_chunks'));
    const body = fn.slice(0, fn.indexOf('$$;'));
    expect(body).toContain('SECURITY INVOKER');
    expect(body).not.toContain('SECURITY DEFINER');
  });

  it('drops the old signature so PostgREST has no overload ambiguity', () => {
    expect(migration).toMatch(/DROP FUNCTION IF EXISTS public\.search_knowledge_chunks\(text, extensions\.vector, int, int, text\[\]\)/);
  });
});
