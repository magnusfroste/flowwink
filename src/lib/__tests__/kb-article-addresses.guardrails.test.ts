import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A KB article has ONE public address, and every writer agrees on it.
 *
 * Found 2026-08-12 by clicking a FlowWork citation: it opened
 * `/kb/rag-er-kunskap-utan-att-träna-in-den` and 404'd. Four components had
 * three opinions and none of them matched the router:
 *
 *   • the retrieval indexer stamped  /kb/<slug>      → no such route
 *   • manage_kb_article returned     /kb/<slug>      → no such route
 *   • the KB hub/featured blocks linked
 *                                    /<kb-page>/<slug> → no such route
 *   • the router had only            /:slug           (one segment)
 *
 * So no KB article could be opened, shared or indexed by a search engine, and
 * FlowWork cited real content with dead links — a 404 dressed as a quality
 * signal. `/kb/:slug` is now the address (modelled on `/blog/:slug`), which
 * also makes the URL the indexer and the skill already emit come true.
 *
 * FlowWork itself does NOT use it: its reader is signed-in staff, and it cites
 * nine source types of which only pages and KB ever have public addresses. Its
 * citations open the admin reading panel via `?article=<id>` — consistent with
 * documents, contracts and employees, which have no public page at all.
 */

const ROOT = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf-8');
/** Source with `//` comments stripped — these files discuss the old URLs. */
const codeOnly = (p: string) => read(p).replace(/\/\/[^\n]*/g, '');

describe('the public address exists and everyone points at it', () => {
  it('the router serves /kb/:slug', () => {
    const app = codeOnly('src/App.tsx');
    expect(app).toMatch(/path:\s*"\/kb\/:slug"/);
    expect(app).toMatch(/KbArticlePage/);
  });

  it('the article page refuses unpublished articles', () => {
    // Otherwise a draft is readable by guessing its slug.
    const hook = codeOnly('src/hooks/useKnowledgeBase.ts');
    const bySlug = hook.match(/export function useKbArticleBySlug[\s\S]*?\n\}/)?.[0] ?? '';
    expect(bySlug, 'useKbArticleBySlug must exist').not.toBe('');
    expect(bySlug).toMatch(/\.eq\('is_published',\s*true\)/);
  });

  it('KB blocks link to the article address, not to a page-relative path', () => {
    for (const f of [
      'src/components/public/blocks/KbHubBlock.tsx',
      'src/components/public/blocks/KbFeaturedBlock.tsx',
    ]) {
      const src = codeOnly(f);
      expect(
        src,
        `${f} still builds a page-relative article link, which matches no route`,
      ).not.toMatch(/to=\{`\/\$\{kbSlug\}\/\$\{article\.slug\}`\}/);
    }
    expect(codeOnly('src/components/public/blocks/KbHubBlock.tsx'))
      .toMatch(/to=\{`\/kb\/\$\{article\.slug\}`\}/);
  });

  it('the indexer keeps stamping the same address the router serves', () => {
    const indexer = codeOnly('supabase/functions/_shared/retrieval/indexer.ts');
    expect(indexer).toMatch(/url:\s*`\/kb\/\$\{data\.slug\}`/);
  });
});

describe('FlowWork citations open the internal reader', () => {
  it('routes KB citations to the admin reading panel', () => {
    const drawer = codeOnly('src/components/admin/workspace/CitationsDrawer.tsx');
    const fn = drawer.match(/function citationHref[\s\S]*?\n\}/)?.[0] ?? '';
    expect(fn, 'citationHref must exist').not.toBe('');
    expect(fn).toMatch(/kb_article/);
    expect(fn).toMatch(/\/admin\/knowledge-base\?article=/);
  });

  it('the admin KB page can be deep-linked into the reader', () => {
    const page = codeOnly('src/pages/admin/KnowledgeBasePage.tsx');
    expect(page).toMatch(/useSearchParams/);
    expect(page).toMatch(/searchParams\.get\('article'\)/);
    // Closing must drop the param, or Back re-opens the panel forever.
    expect(page).toMatch(/next\.delete\('article'\)/);
  });
});
