import { describe, expect, it } from 'vitest';
import { pagePath } from '@/lib/language-path';
import { overlayUrls } from '../../../supabase/functions/_shared/sitemap-alternates';
import { siblingRowsFromModels, buildSiblingOf } from '@/hooks/usePageSiblings';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** docs/architecture/addresses.md — the language in the prefix, the slug the language's own. */
describe('a page address per language', () => {
  const base = { slug: 'villkor', defaultLanguage: 'sv', homepageSlug: 'hem' };

  it('the site language owns the root; another language gets a prefix', () => {
    expect(pagePath({ ...base, locale: 'sv' })).toBe('/villkor');
    expect(pagePath({ ...base, locale: 'en', baseSlug: 'villkor' })).toBe('/en/villkor');
  });
  it("a translation's own slug wins after the prefix", () => {
    expect(pagePath({ ...base, locale: 'en', baseSlug: 'villkor', pathSlug: 'terms' })).toBe('/en/terms');
    // …but never in the site language, and never for the home page.
    expect(pagePath({ ...base, locale: 'sv', pathSlug: 'terms' })).toBe('/villkor');
    expect(pagePath({ ...base, slug: 'hem', locale: 'en', baseSlug: 'hem', pathSlug: 'home' })).toBe('/en');
  });
  it('the sitemap twin agrees', () => {
    const { urls, pageAlternates } = overlayUrls(
      [{ slug: 'villkor', locale: 'sv' } as never],
      [{ page_slug: 'villkor', locale: 'en', slug: 'terms' }],
      'sv', 'https://x.se', 'hem',
    );
    expect(urls[0].path).toBe('/en/terms');
    expect(pageAlternates.get('villkor')).toEqual(expect.arrayContaining([
      { hreflang: 'sv', href: 'https://x.se/villkor' },
      { hreflang: 'en', href: 'https://x.se/en/terms' },
    ]));
  });
  it('the nav links an overlay at its own slug', () => {
    const rows = siblingRowsFromModels(
      [{ id: 'p1', slug: 'villkor', title: 'Villkor', locale: 'sv', translation_group_id: null }],
      [{ page_id: 'p1', locale: 'en', slug: 'terms', strings: { 'page.title': { text: 'Terms' } } }],
    );
    const siblingOf = buildSiblingOf(rows, 'en', 'sv', 'hem');
    expect(siblingOf('villkor')).toMatchObject({ title: 'Terms', path: '/en/terms' });
  });
});

describe('system routes are fixed', () => {
  it('the blog settings no longer offer an archive slug the router never read', () => {
    // The live tab (/admin/blog/settings → BlogPage). BlogSettingsPage.tsx was
    // an orphan no route rendered — the word floor (#814) landed there and was
    // unreachable; it is gone.
    const src = readFileSync(join(__dirname, '../../components/admin/blog/BlogSettingsTab.tsx'), 'utf8');
    expect(src).not.toMatch(/updateField\('archiveSlug'/);
  });
  it('the terms page is chosen among pages, not typed', () => {
    const src = readFileSync(join(__dirname, '../../pages/admin/SiteSettingsPage.tsx'), 'utf8');
    expect(src).not.toMatch(/termsSlug: e\.target\.value/);
  });
});
