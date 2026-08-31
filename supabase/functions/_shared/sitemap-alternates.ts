/**
 * Language alternates for the sitemap.
 *
 * The `<link rel="alternate" hreflang>` tags in the page head are emitted by
 * react-helmet, which means a crawler only sees them after executing
 * JavaScript. Google does that, but in a second pass — and this instance's
 * prerender path (`api/og.ts`) runs only for SOCIAL crawlers, so there is no
 * server-rendered head for a search engine at all.
 *
 * The sitemap is the channel that needs no JavaScript. Optic publishes seven
 * language pairs and the sitemap listed all fourteen URLs with nothing to say
 * that they belong together — fourteen unrelated pages, two of which look like
 * duplicate content in the wrong market.
 *
 * The rules mirror src/lib/hreflang.ts, and for the same reasons:
 *   * every version lists every version, itself included
 *   * absolute URLs
 *   * x-default points at the site's default language, and is OMITTED rather
 *     than guessed when no version is written in it
 *
 * A page with no siblings gets no alternates at all — a set of one is not a set.
 */
export interface SitemapPage {
  slug: string;
  locale?: string | null;
  translation_group_id?: string | null;
}

/** 'sv-SE' → 'sv' */
function baseSubtag(tag: string): string {
  return String(tag ?? '').trim().toLowerCase().split('-')[0];
}

export interface AlternatesInput {
  pages: SitemapPage[];
  /** The site's declared default language, or '' when it has not declared one. */
  defaultLanguage: string;
  /** Builds the absolute URL for a slug — shared with the <loc> so they agree. */
  href: (slug: string) => string;
}

/**
 * @returns slug → the alternates to nest inside that page's <url> entry.
 *   A slug missing from the map has none.
 */
export function sitemapAlternates(
  { pages, defaultLanguage, href }: AlternatesInput,
): Map<string, Array<{ hreflang: string; href: string }>> {
  const groups = new Map<string, SitemapPage[]>();
  for (const page of pages ?? []) {
    const group = page?.translation_group_id;
    if (!group || !page.slug || !page.locale) continue;
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group)!.push(page);
  }

  const out = new Map<string, Array<{ hreflang: string; href: string }>>();
  const wanted = baseSubtag(defaultLanguage);

  for (const siblings of groups.values()) {
    if (siblings.length < 2) continue;

    const alternates = siblings.map((s) => ({
      hreflang: String(s.locale).toLowerCase(),
      href: href(s.slug),
    }));

    const fallback = wanted
      ? (siblings.find((s) => String(s.locale).toLowerCase() === String(defaultLanguage).toLowerCase())
        ?? siblings.find((s) => baseSubtag(String(s.locale)) === wanted))
      : undefined;
    if (fallback) alternates.push({ hreflang: 'x-default', href: href(fallback.slug) });

    for (const sibling of siblings) out.set(sibling.slug, alternates);
  }

  return out;
}
