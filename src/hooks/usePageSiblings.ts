/**
 * The visitor's-language sibling of a page, for every surface that lists
 * pages (header nav, footer quick links, …).
 *
 * The header localised its menu through this exact lookup while the footer
 * listed `pages` raw — so the day a site carried two languages the footer
 * showed BOTH (synclair, 2026-10-23: fourteen quick links, half of them
 * Swedish under an English page). One rail, two consumers, so they cannot
 * drift again. Since 2026-10 a language version can also be an OVERLAY
 * (page_translations — one page, text per language); both models feed the
 * same lookup. On a monolingual site the overlay query returns zero rows.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { pickLocale } from '@/lib/pick-locale';
import { pagePath } from '@/lib/language-path';
import { useSiteLanguages } from '@/hooks/useSiteSettings';

export interface PageSibling { slug: string; title: string; path: string }
export type SiblingOf = (slug: string) => PageSibling | null;

/**
 * One language version of a page, from either model: a sibling ROW
 * (pages.translation_group_id, the pre-overlay model) or an OVERLAY
 * (page_translations — same slug as the page, another locale, its own title).
 * Overlay versions share a synthetic group `overlay:<page id>` with the page
 * row, so the lookup below treats both models alike.
 */
export interface SiblingRow {
  slug: string;
  title: string;
  locale: string | null;
  translation_group_id: string | null;
  kind?: 'row' | 'overlay';
  /** An overlay's own slug in its language (/en/terms for /villkor). */
  pathSlug?: string | null;
}

interface OverlayVersion { page_id: string; locale: string; slug?: string | null; strings: { 'page.title'?: { text?: string } } | null }
interface PageHead { id: string; slug: string; title: string; locale: string | null; translation_group_id: string | null }

/** Pure: pages + published overlays → one row per language version. Exported for tests. */
export function siblingRowsFromModels(pages: PageHead[], overlays: OverlayVersion[]): SiblingRow[] {
  const rows: SiblingRow[] = [];
  const byPage = new Map<string, OverlayVersion[]>();
  for (const o of overlays) {
    if (!byPage.has(o.page_id)) byPage.set(o.page_id, []);
    byPage.get(o.page_id)!.push(o);
  }
  for (const p of pages) {
    const own = byPage.get(p.id) ?? [];
    if (p.translation_group_id) {
      rows.push({ slug: p.slug, title: p.title, locale: p.locale, translation_group_id: p.translation_group_id, kind: 'row' });
    }
    if (own.length) {
      const group = `overlay:${p.id}`;
      if (!p.translation_group_id) rows.push({ slug: p.slug, title: p.title, locale: p.locale, translation_group_id: group, kind: 'row' });
      for (const o of own) {
        rows.push({
          slug: p.slug,
          title: o.strings?.['page.title']?.text?.trim() || p.title,
          locale: o.locale,
          translation_group_id: p.translation_group_id ?? group,
          kind: 'overlay',
          pathSlug: o.slug ?? null,
        });
      }
    }
  }
  return rows;
}

/** Pure: the lookup over already-loaded rows. Exported for tests. */
export function buildSiblingOf(
  rows: SiblingRow[],
  currentLocale: string | null | undefined,
  siteDefaultLanguage: string,
  homepageSlug?: string,
): SiblingOf {
  if (!currentLocale || rows.length === 0) return () => null;
  // The page ROW for a slug (overlay entries share its slug; the row wins).
  const bySlug = new Map<string, SiblingRow>();
  for (const p of rows) {
    const existing = bySlug.get(p.slug);
    if (!existing || ((existing.kind ?? 'row') === 'overlay' && (p.kind ?? 'row') === 'row')) bySlug.set(p.slug, p);
  }
  return (slug: string) => {
    const source = bySlug.get(slug);
    if (!source?.translation_group_id) return null;
    const group = rows.filter((p) => p.translation_group_id === source.translation_group_id);
    const chosen = pickLocale({
      available: group.map((p) => String(p.locale ?? '')),
      wanted: currentLocale,
    });
    if (!chosen) return null;
    const target = group.find((p) => String(p.locale ?? '') === chosen);
    if (!target) return null;
    const groupBase = group.find(
      (p) => String(p.locale ?? '').toLowerCase().split('-')[0] === siteDefaultLanguage.split('-')[0],
    )?.slug ?? null;
    // The address form: /en/<base slug>, never the row's own -en slug.
    const path = pagePath({
      slug: target.slug, locale: String(target.locale ?? ''),
      defaultLanguage: siteDefaultLanguage, baseSlug: groupBase, homepageSlug,
      pathSlug: target.pathSlug,
    });
    // The page itself in the visitor's language is nothing to swap only when
    // its address IS its slug (the default language). A row in another
    // language still has an address to give: `products-sv` lives at
    // /sv/products, and answering null sent the nav to the raw /products-sv
    // (nordbrygg 2026-10-25). An overlay shares the page's slug but is
    // another version — it is never "the same".
    if (target.slug === slug && (target.kind ?? 'row') === 'row' && (path === `/${slug}` || path === '/')) return null;
    return { slug: target.slug, title: target.title, path };
  };
}

/**
 * Pure: a list of menu pages, each swapped for its sibling in the visitor's
 * language, then deduped on the final address — a translation group is ONE
 * entry however many of its rows carry show_in_menu.
 */
export function localizeMenuPages<T extends { slug: string; title: string }>(
  pages: T[],
  siblingOf: SiblingOf,
  homeSlug = 'hem',
): Array<T & { path: string }> {
  const localized = pages.map((page) => {
    const sibling = siblingOf(page.slug);
    return sibling
      ? { ...page, slug: sibling.slug, title: sibling.title, path: sibling.path }
      : { ...page, path: page.slug === homeSlug ? '/' : `/${page.slug}` };
  });
  const seen = new Set<string>();
  return localized.filter((page) => {
    if (seen.has(page.slug)) return false;
    seen.add(page.slug);
    return true;
  });
}

/**
 * An internal link ('/contact', '/product#faq') pointed at the visitor's
 * language version of that page. External links and pages without a sibling
 * come back unchanged — an uglier address that still resolves, never a broken one.
 */
export function localizeHref(url: string, siblingOf: SiblingOf, homepageSlug?: string): string {
  if (!url || !url.startsWith('/') || url.startsWith('//')) return url;
  const [path, hash] = url.split('#');
  const slug = path.replace(/^\//, '').replace(/\/$/, '');
  // "/" is the homepage: in another language it is that language's homepage.
  const key = slug || homepageSlug || '';
  const sibling = key ? siblingOf(key) : null;
  if (!sibling) return url;
  return `${sibling.path}${hash ? `#${hash}` : ''}`;
}

export function usePageSiblings(currentLocale: string | null | undefined, homepageSlug?: string): { siblingOf: SiblingOf } {
  const { defaultLanguage: siteDefaultLanguage } = useSiteLanguages();
  const { data: siblings = [] } = useQuery({
    queryKey: ['public-nav-translations'],
    enabled: !!currentLocale,
    queryFn: async () => {
      // Both models: sibling rows, and published overlays with their pages.
      // RLS already limits the overlays to published ones on published pages;
      // an instance without the table yet (several schema versions run at
      // once) simply has none.
      const [{ data: pages, error }, overlaysRes] = await Promise.all([
        supabase
          .from('pages')
          .select('id, slug, title, locale, translation_group_id')
          .eq('status', 'published')
          .is('deleted_at', null),
        supabase
          .from('page_translations')
          .select('page_id, locale, slug, strings')
          .eq('status', 'published'),
      ]);
      if (error) throw error;
      const overlays = (overlaysRes.error ? [] : (overlaysRes.data || [])) as unknown as OverlayVersion[];
      return siblingRowsFromModels((pages || []) as PageHead[], overlays);
    },
    staleTime: 1000 * 60 * 5,
  });
  const siblingOf = useMemo(
    () => buildSiblingOf(siblings, currentLocale, siteDefaultLanguage, homepageSlug),
    [siblings, currentLocale, siteDefaultLanguage, homepageSlug],
  );
  return { siblingOf };
}
