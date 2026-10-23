/**
 * The visitor's-language sibling of a page, for every surface that lists
 * pages (header nav, footer quick links, …).
 *
 * The header localised its menu through this exact lookup while the footer
 * listed `pages` raw — so the day a site carried two languages the footer
 * showed BOTH (synclair, 2026-10-23: fourteen quick links, half of them
 * Swedish under an English page). One rail, two consumers, so they cannot
 * drift again. The query only touches rows that belong to a translation
 * group; on a monolingual site that is zero rows and the cost is nothing.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { pickLocale } from '@/lib/pick-locale';
import { pagePath } from '@/lib/language-path';
import { useSiteLanguages } from '@/hooks/useSiteSettings';

export interface PageSibling { slug: string; title: string; path: string }
export type SiblingOf = (slug: string) => PageSibling | null;

interface SiblingRow { slug: string; title: string; locale: string | null; translation_group_id: string | null }

/** Pure: the lookup over already-loaded rows. Exported for tests. */
export function buildSiblingOf(
  rows: SiblingRow[],
  currentLocale: string | null | undefined,
  siteDefaultLanguage: string,
): SiblingOf {
  if (!currentLocale || rows.length === 0) return () => null;
  const bySlug = new Map(rows.map((p) => [p.slug, p]));
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
    if (!target || target.slug === slug) return null;
    const groupBase = group.find(
      (p) => String(p.locale ?? '').toLowerCase().split('-')[0] === siteDefaultLanguage.split('-')[0],
    )?.slug ?? null;
    return {
      slug: target.slug,
      title: target.title,
      // The address form: /en/<base slug>, never the row's own -en slug.
      path: pagePath({
        slug: target.slug, locale: String(target.locale ?? ''),
        defaultLanguage: siteDefaultLanguage, baseSlug: groupBase,
      }),
    };
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
export function localizeHref(url: string, siblingOf: SiblingOf): string {
  if (!url || !url.startsWith('/')) return url;
  const [path, hash] = url.split('#');
  const slug = path.replace(/^\//, '').replace(/\/$/, '');
  const sibling = slug ? siblingOf(slug) : null;
  if (!sibling) return url;
  return `${sibling.path}${hash ? `#${hash}` : ''}`;
}

export function usePageSiblings(currentLocale: string | null | undefined): { siblingOf: SiblingOf } {
  const { defaultLanguage: siteDefaultLanguage } = useSiteLanguages();
  const { data: siblings = [] } = useQuery({
    queryKey: ['public-nav-translations'],
    enabled: !!currentLocale,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pages')
        .select('slug, title, locale, translation_group_id')
        .eq('status', 'published')
        .is('deleted_at', null)
        .not('translation_group_id', 'is', null);
      if (error) throw error;
      return (data || []) as SiblingRow[];
    },
    staleTime: 1000 * 60 * 5,
  });
  const siblingOf = useMemo(
    () => buildSiblingOf(siblings, currentLocale, siteDefaultLanguage),
    [siblings, currentLocale, siteDefaultLanguage],
  );
  return { siblingOf };
}
