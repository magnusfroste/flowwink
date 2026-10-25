import { describe, it, expect } from 'vitest';
import { buildSiblingOf, localizeMenuPages, localizeHref, siblingRowsFromModels } from '@/hooks/usePageSiblings';
import { overlayUrls } from '../../../supabase/functions/_shared/sitemap-alternates';

/**
 * Guardrail: a language version stored as an OVERLAY (page_translations) is
 * a sibling to every surface that lists pages — nav, footer, sitemap — exactly
 * like a sibling ROW is. page-translations.md §4, §8 step 4.
 */
const pages = [
  { id: 'p1', slug: 'tjanster', title: 'Tjänster', locale: 'sv', translation_group_id: null },
  { id: 'p2', slug: 'om-oss', title: 'Om oss', locale: 'sv', translation_group_id: null },
  // a legacy group, still rows
  { id: 'p3', slug: 'kontakt', title: 'Kontakt', locale: 'sv', translation_group_id: 'g1' },
  { id: 'p4', slug: 'kontakt-en', title: 'Contact', locale: 'en', translation_group_id: 'g1' },
];
const overlays = [
  { page_id: 'p1', locale: 'en', strings: { 'page.title': { text: 'Services', source_hash: 'x' } } },
  { page_id: 'p1', locale: 'de', strings: {} }, // no translated title → the page's
];

describe('siblingRowsFromModels — rows and overlays become one list of versions', () => {
  it('an overlay is a version with the PAGE slug, its own locale and its translated title', () => {
    const rows = siblingRowsFromModels(pages, overlays);
    const tj = rows.filter((r) => r.slug === 'tjanster');
    expect(tj.map((r) => `${r.locale}:${r.title}:${r.kind}`)).toEqual(['sv:Tjänster:row', 'en:Services:overlay', 'de:Tjänster:overlay']);
    expect(new Set(tj.map((r) => r.translation_group_id)).size).toBe(1);
  });
  it('a page with neither group nor overlays is not a version of anything', () => {
    expect(siblingRowsFromModels(pages, overlays).find((r) => r.slug === 'om-oss')).toBeUndefined();
  });
  it('legacy rows are untouched', () => {
    const rows = siblingRowsFromModels(pages, overlays).filter((r) => r.translation_group_id === 'g1');
    expect(rows.map((r) => r.slug)).toEqual(['kontakt', 'kontakt-en']);
  });
});

describe('buildSiblingOf over both models', () => {
  const rows = siblingRowsFromModels(pages, overlays);
  it('an English visitor on a Swedish site gets the overlay version at /en/<page slug>, with the overlay title', () => {
    const en = buildSiblingOf(rows, 'en', 'sv');
    expect(en('tjanster')).toEqual({ slug: 'tjanster', title: 'Services', path: '/en/tjanster' });
    expect(en('kontakt')).toEqual({ slug: 'kontakt-en', title: 'Contact', path: '/en/kontakt' }); // legacy, as before
    expect(en('om-oss')).toBeNull();
  });
  it('a Swedish visitor gets nothing to swap on a Swedish page with overlays', () => {
    const sv = buildSiblingOf(rows, 'sv', 'sv');
    expect(sv('tjanster')).toBeNull();
  });
  it('menu and hrefs follow', () => {
    const en = buildSiblingOf(rows, 'en', 'sv');
    const menu = localizeMenuPages([{ slug: 'tjanster', title: 'Tjänster' }, { slug: 'om-oss', title: 'Om oss' }], en);
    expect(menu.map((m) => `${m.title}@${m.path}`)).toEqual(['Services@/en/tjanster', 'Om oss@/om-oss']);
    expect(localizeHref('/tjanster#priser', en)).toBe('/en/tjanster#priser');
  });
});

describe('overlayUrls — the sitemap lists an overlay at /<lang>/<slug> with the full alternate set', () => {
  it('one <url> per overlay; the page entry gets the same alternates; x-default on the source', () => {
    const { urls, pageAlternates } = overlayUrls(
      [{ slug: 'tjanster', locale: 'sv', translation_group_id: null }, { slug: 'home', locale: 'sv', translation_group_id: null }],
      [{ page_slug: 'tjanster', locale: 'en' }, { page_slug: 'home', locale: 'en' }, { page_slug: 'missing', locale: 'en' }],
      'sv', 'https://x.se', 'home',
    );
    expect(urls.map((u) => u.path)).toEqual(['/en/tjanster', '/en']);
    const set = pageAlternates.get('tjanster')!;
    expect(set).toEqual([
      { hreflang: 'sv', href: 'https://x.se/tjanster' },
      { hreflang: 'en', href: 'https://x.se/en/tjanster' },
      { hreflang: 'x-default', href: 'https://x.se/tjanster' },
    ]);
    expect(urls[0].alternates).toEqual(set);
    expect(pageAlternates.get('home')!.map((a) => a.href)).toEqual(['https://x.se/', 'https://x.se/en', 'https://x.se/']);
  });
});
