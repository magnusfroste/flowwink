import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Two rules about WHAT the knowledge index holds and who may ask for it.
 *
 * 1. NOBODY PAYS TO INDEX WHAT THEY SWITCHED OFF. Embedding costs money per
 *    call. A source whose module is disabled must not be embedded, and its
 *    existing chunks must go — "module off" should mean the same thing in the
 *    index as in the nav. (Raised by the product owner 2026-08-12: "inte
 *    embedda sådant som kunden inte vill embedda och få en kostnad för".)
 *
 * 2. VENDOR DOCS ARE NOT CUSTOMER CONTENT. `docs_pages` holds FlowWink's own
 *    repo documentation, synced onto customer instances. It is indexed so the
 *    docs page can search itself — but it must never appear in a source list a
 *    customer-facing surface can request. This already went wrong once
 *    (2026-08-11): vendor architecture notes surfaced in a customer chat. The
 *    protection today is that no surface happens to ask for it; this test
 *    turns that habit into a rule.
 */

const ROOT = join(__dirname, '../../..');
const INDEXER = join(ROOT, 'supabase/functions/_shared/retrieval/indexer.ts');
const CHAT_COMPLETION = join(ROOT, 'supabase/functions/chat-completion/index.ts');
const WORKSPACE_CHAT = join(ROOT, 'supabase/functions/workspace-chat/index.ts');

/**
 * Source with `//` comments removed. These files DISCUSS docs_pages at length
 * — the workspace map carries a comment explaining why it maps `handbook` to
 * handbook_chapters and NOT docs_pages. A rule about the code must read the
 * code; prose about the rule is not a violation of it.
 */
const codeOnly = (path: string) => readFileSync(path, 'utf-8').replace(/\/\/[^\n]*/g, '');

describe('the indexer only spends on enabled modules', () => {
  const src = readFileSync(INDEXER, 'utf-8');

  it('maps every chunk source to an owning module', () => {
    const sources = (src.match(/export const CHUNK_SOURCES = \[(.*?)\]/s)?.[1] ?? '')
      .split(',')
      .map((s) => s.trim().replace(/['"]/g, ''))
      .filter(Boolean);
    expect(sources.length).toBeGreaterThan(0);
    const map = src.match(/export const SOURCE_MODULE[\s\S]*?\n\};/)?.[0] ?? '';
    for (const source of sources) {
      expect(map, `SOURCE_MODULE is missing an owner for '${source}'`).toContain(`${source}:`);
    }
  });

  it('reads module state from the settings ROW, never a column', () => {
    // The column-vs-row trap (documented in _shared/modules.ts) silently
    // returns null, which here would read as "no modules enabled".
    const loader = src.match(/export async function loadEnabledSources[\s\S]*?\n\}/)?.[0] ?? '';
    expect(loader).toMatch(/\.select\('value'\)/);
    expect(loader).toMatch(/\.eq\('key', 'modules'\)/);
    expect(loader, "must not select a 'modules' column").not.toMatch(/\.select\('modules'\)/);
  });

  it('treats an unreadable module map as "index everything"', () => {
    // Failing closed would silently empty a working instance's index the first
    // time the settings read hiccups. Degrade, never gate (Law 4).
    const loader = src.match(/export async function loadEnabledSources[\s\S]*?\n\}/)?.[0] ?? '';
    expect(loader).toMatch(/if\s*\(!modules\)\s*return new Set\(CHUNK_SOURCES\)/);
  });

  it('drops queue items for disabled modules instead of embedding them', () => {
    const sweep = src.match(/export async function processQueue[\s\S]*?\n\}/)?.[0] ?? '';
    expect(sweep).toMatch(/const enabled = await loadEnabledSources\(service\)/);
    expect(sweep).toMatch(/if\s*\(!enabled\.has\(item\.source_table\)\)/);
    // …and clears what was already indexed, so the index agrees with the nav.
    const disabledBranch = sweep.match(/if\s*\(!enabled\.has\(item\.source_table\)\)[\s\S]*?continue;/)?.[0] ?? '';
    expect(disabledBranch).toMatch(/from\('knowledge_chunks'\)[\s\S]*?\.delete\(\)/);
    expect(disabledBranch).toMatch(/from\('knowledge_index_queue'\)[\s\S]*?\.delete\(\)/);
  });
});

describe('vendor documentation never enters the public tier', () => {
  it('indexes docs_pages as internal, never public', () => {
    // `knowledge_chunks` has an RLS policy "Anyone can read public chunks", and
    // `search_knowledge_chunks` is EXECUTE-granted to anon. A publishable key
    // (which ships in the JS bundle by design) plus `sources:["docs_pages"]`
    // was therefore enough to read FlowWink's architecture documentation out of
    // a customer's database — no login, no chat surface. Found live on four
    // fleet instances (7,959 chunks) on 2026-08-12. The tier is the fix; the
    // surface-level rule below is the second lock.
    const src = codeOnly(INDEXER);
    const branch = src.match(/case 'docs_pages': \{[\s\S]*?\n    \}/)?.[0] ?? '';
    expect(branch, "the docs_pages branch must exist to be checked").not.toBe('');
    expect(branch).toMatch(/visibility:\s*'internal'/);
    expect(
      branch,
      "vendor docs classed 'public' are readable by anon via search_knowledge_chunks",
    ).not.toMatch(/visibility:\s*'public'/);
  });
});

describe('vendor documentation never reaches a customer-facing surface', () => {
  it('the visitor chat cannot request docs_pages', () => {
    const src = codeOnly(CHAT_COMPLETION);
    const sources = src.match(/const sources = \[[\s\S]*?\];/)?.[0] ?? '';
    expect(sources, 'visitor chat must build its source list from pages/kb only').not.toContain('docs_pages');
    expect(src, "docs_pages must not appear anywhere in the visitor chat's retrieval path")
      .not.toMatch(/sources[\s\S]{0,200}docs_pages/);
  });

  it('the workspace chat maps `handbook` to the customer handbook, not vendor docs', () => {
    const src = codeOnly(WORKSPACE_CHAT);
    const map = src.match(/const KNOWLEDGE_TABLES[\s\S]*?\n\s*\};/)?.[0]
      ?? src.match(/KNOWLEDGE_TABLES\s*=\s*\{[\s\S]*?\n\s*\}/)?.[0]
      ?? '';
    expect(map).toMatch(/handbook:\s*'handbook_chapters'/);
    expect(
      map,
      'docs_pages is FlowWink\'s own repo documentation — it must not be reachable as a workspace source',
    ).not.toContain('docs_pages');
  });
});
