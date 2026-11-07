import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The internal KB tier. Audience used to be a property of the TABLE — the chunk
 * indexer hardcoded 'public' for every kb_articles row and 'internal' for every
 * wiki_pages row — so the only way to hide internal Q&A was to move it to the
 * wiki and lose the KB's shape. Found on optic, where five sales playbooks
 * written in the seller's voice were published on the public help centre.
 *
 * These guards cover the ways the tier can silently stop working: retrieval
 * flattening it back to a constant, a public surface forgetting the filter, and
 * the agent path being unable to author internal articles at all.
 */

const root = resolve(__dirname, '../../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf-8');

describe('retrieval carries the article audience', () => {
  const src = read('supabase/functions/_shared/retrieval/indexer.ts');
  const kb = src.slice(src.indexOf("case 'kb_articles'"), src.indexOf("case 'wiki_pages'"));

  it('derives kb visibility from the row, not from the table', () => {
    expect(kb).toContain('data.visibility');
    expect(
      /visibility:\s*'public'/.test(kb),
      "the indexer hardcodes visibility again — every internal article would be indexed as public and reachable by anonymous chat",
    ).toBe(false);
  });

  it('selects the column it depends on', () => {
    // A missing column in the select silently yields undefined, which the
    // ternary reads as "not internal" — the failure would be invisible.
    expect(kb).toMatch(/\.select\([^)]*visibility/);
  });

  it('defaults to public for rows written before the column existed', () => {
    expect(kb).toContain("=== 'internal' ? 'internal' : 'public'");
  });
});

describe('public KB surfaces filter the internal tier', () => {
  const dir = resolve(root, 'src/components/public/blocks');
  const blocks = readdirSync(dir).filter((f) => /^Kb.*Block\.tsx$/.test(f));

  it('finds the KB blocks', () => {
    expect(blocks.length).toBeGreaterThanOrEqual(3);
  });

  for (const file of blocks) {
    const src = readFileSync(resolve(dir, file), 'utf-8');
    if (!src.includes("from('kb_articles')")) continue;
    it(`${file} asks only for public articles`, () => {
      expect(
        src.includes("a.visibility !== 'internal'"),
        `${file} reads kb_articles without dropping the internal tier — RLS still protects visitors, ` +
          'but a logged-in staff member would see internal articles on the PUBLIC page',
      ).toBe(true);
      expect(
        src.includes("eq('visibility'"),
        `${file} filters visibility in the QUERY — that is a PostgREST error on an instance ` +
          'that has not run the migration yet. Filter the rows in the client instead.',
      ).toBe(false);
    });
  }

  it('the public knowledge base page filters too (it shares the admin hook)', () => {
    const page = read('src/pages/KnowledgeBasePage.tsx');
    expect(page).toContain("visibility !== 'internal'");
  });
});

describe('agents can author internal articles', () => {
  const mod = read('src/lib/modules/kb-module.ts');
  const handler = read('supabase/functions/_shared/execute/core.ts');

  it('the skill declares the parameter', () => {
    expect(mod).toMatch(/visibility:\s*\{[\s\S]*?enum:\s*\['public',\s*'internal'\]/);
  });

  /**
   * Law 2: the choice rule has to be in the DESCRIPTION, which the scorer reads
   * before the call — instructions arrive too late to change which skill runs
   * or how the first attempt is shaped. The blog incident (2026-07-22) proved
   * this live.
   */
  it('the description tells the agent when to choose internal', () => {
    const desc = mod.slice(mod.indexOf("name: 'manage_kb_article'"));
    expect(desc.slice(0, 2000)).toContain('internal');
  });

  it('the create path writes the column instead of dropping it', () => {
    // create() whitelists fields; update() passes them through. Only create can
    // silently lose it.
    const create = handler.slice(
      handler.indexOf("if (action === 'create')"),
      handler.indexOf("async function resolveArticleId"),
    );
    expect(create).toContain('visibility');
  });
});

describe('the service-role paths filter too — RLS cannot help them', () => {
  /**
   * chat-completion's legacy fallback calls buildKnowledgeBase with the SERVICE
   * client, which bypasses RLS. It runs only when the chunk-retrieval path
   * throws, so a leak there would surface exactly when something else is
   * already broken and nobody is watching the chat.
   */
  it('the legacy chat knowledge dump asks only for public articles', () => {
    const ctx = read('supabase/functions/_shared/chat-context.ts');
    expect(ctx).toContain("eq('visibility', 'public')");
  });

  /**
   * …and survives an instance that has not run the migration yet. The fleet
   * runs several schema versions at once by design (forks sync manually), so a
   * hard filter on a new column would take the chat down there instead of
   * degrading.
   */
  it('falls back instead of erroring where the column does not exist', () => {
    const ctx = read('supabase/functions/_shared/chat-context.ts');
    expect(ctx).toContain('if (strict.error)');
  });
});

describe('the migration is the actual gate', () => {
  const sql = read('supabase/migrations/20260805090000_kb-article-visibility.sql');

  it('anonymous visitors are blocked by RLS, not by a client filter', () => {
    expect(sql).toContain("is_published = true AND visibility = 'public'");
  });

  it('defines is_staff itself rather than assuming an older migration landed', () => {
    // 20260726180000 introduced it, but backdated migrations are skipped on
    // managed instances — an internal tier whose predicate is missing fails.
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.is_staff');
  });

  it('is idempotent', () => {
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS visibility');
    expect(sql).toContain('DROP POLICY IF EXISTS');
  });
});
