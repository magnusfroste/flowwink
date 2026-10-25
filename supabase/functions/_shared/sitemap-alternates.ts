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

/** A published overlay (page_translations): the page's slug in another language. */
export interface SitemapOverlay {
  page_slug: string;
  locale: string;
}

export interface OverlayUrl {
  /** The page the overlay belongs to. */
  page_slug: string;
  locale: string;
  /** '/en/product' or '/en' for the homepage. */
  path: string;
  alternates: Array<{ hreflang: string; href: string }>;
}

/**
 * The extra <url> entries the overlay model adds: one per published overlay,
 * at /<lang>/<page slug>, each carrying the full alternate set (the page
 * itself + every overlay, x-default on the page when it is written in the
 * site's default language). Also returns the alternates the PAGE's own entry
 * should carry, keyed by page slug — a page with overlays is a set now.
 *
 * Kept apart from `sitemapAlternates` because that map is keyed by slug and
 * an overlay shares its page's slug: one key cannot hold two URLs.
 */
export function overlayUrls(
  pages: SitemapPage[],
  overlays: SitemapOverlay[],
  defaultLanguage: string,
  baseUrl: string,
  homepageSlug: string,
): { urls: OverlayUrl[]; pageAlternates: Map<string, Array<{ hreflang: string; href: string }>> } {
  const origin = String(baseUrl ?? '').replace(/\/+$/, '');
  const abs = (path: string) => (path === '/' ? `${origin}/` : `${origin}${path}`);
  const wanted = baseSubtag(defaultLanguage);
  const bySlug = new Map((pages ?? []).map((p) => [p.slug, p]));
  const byPage = new Map<string, SitemapOverlay[]>();
  for (const o of overlays ?? []) {
    if (!o?.page_slug || !o?.locale || !bySlug.has(o.page_slug)) continue;
    if (!byPage.has(o.page_slug)) byPage.set(o.page_slug, []);
    byPage.get(o.page_slug)!.push(o);
  }
  const urls: OverlayUrl[] = [];
  const pageAlternates = new Map<string, Array<{ hreflang: string; href: string }>>();
  for (const [slug, list] of byPage) {
    const page = bySlug.get(slug)!;
    const pageLocale = String(page.locale ?? defaultLanguage).toLowerCase();
    const pagePathOwn = pagePath(slug, page.locale ?? null, defaultLanguage, null, homepageSlug);
    const versions = [
      { locale: pageLocale, path: pagePathOwn },
      ...list.map((o) => ({ locale: o.locale.toLowerCase(), path: pagePath(slug, o.locale, defaultLanguage, slug, homepageSlug) })),
    ];
    const set = versions.map((v) => ({ hreflang: v.locale, href: abs(v.path) }));
    const fallback = versions.find((v) => v.locale === String(defaultLanguage).toLowerCase())
      ?? (wanted ? versions.find((v) => baseSubtag(v.locale) === wanted) : undefined);
    if (fallback) set.push({ hreflang: 'x-default', href: abs(fallback.path) });
    pageAlternates.set(slug, set);
    for (const o of list) {
      urls.push({ page_slug: slug, locale: o.locale.toLowerCase(), path: pagePath(slug, o.locale, defaultLanguage, slug, homepageSlug), alternates: set });
    }
  }
  return { urls, pageAlternates };
}

/** 'sv-SE' → 'sv' */
function baseSubtag(tag: string): string {
  return String(tag ?? '').trim().toLowerCase().split('-')[0];
}

export interface AlternatesInput {
  pages: SitemapPage[];
  /** The site's declared default language, or '' when it has not declared one. */
  defaultLanguage: string;
  /** Origin without a trailing slash. */
  baseUrl: string;
  /** The slug served at '/'. */
  homepageSlug: string;
}

export interface SitemapAddressing {
  /** slug → the canonical PATH for that row ('/en/product', '/product', '/'). */
  canonicalPath: Map<string, string>;
  /** slug → the alternates to nest inside that page's <url> entry. */
  alternates: Map<string, Array<{ hreflang: string; href: string }>>;
}

/**
 * The address form, mirrored from src/lib/language-path.ts — the edge bundle
 * cannot reach src/, so this is a twin like pick_locale's SQL side. The shared
 * cases are pinned in sitemap-alternates.guardrails.test.ts; change one,
 * change both.
 */
function pagePath(
  slug: string,
  locale: string | null | undefined,
  defaultLanguage: string,
  baseSlug: string | null,
  homepageSlug: string,
): string {
  const lang = String(locale ?? '').trim().toLowerCase();
  const isDefault = !lang || baseSubtag(lang) === baseSubtag(defaultLanguage);
  if (isDefault) return slug === homepageSlug ? '/' : `/${slug}`;
  const base = String(baseSlug ?? '').trim() || slug;
  if (homepageSlug && base === homepageSlug) return `/${lang}`;
  return `/${lang}/${base}`;
}

/**
 * @returns slug → the alternates to nest inside that page's <url> entry.
 *   A slug missing from the map has none.
 */
export function sitemapAlternates(
  { pages, defaultLanguage, baseUrl, homepageSlug }: AlternatesInput,
): SitemapAddressing {
  const origin = String(baseUrl ?? '').replace(/\/+$/, '');
  const wanted = baseSubtag(defaultLanguage);
  const abs = (path: string) => (path === '/' ? `${origin}/` : `${origin}${path}`);

  const groups = new Map<string, SitemapPage[]>();
  const canonicalPath = new Map<string, string>();
  for (const page of pages ?? []) {
    if (!page?.slug) continue;
    // Varje rad får en kanonisk sökväg — även de ogrupperade, som alltid bor
    // på roten i sajtens eget språk.
    const group = page.translation_group_id;
    if (!group || !page.locale) {
      canonicalPath.set(page.slug, pagePath(page.slug, null, defaultLanguage, null, homepageSlug));
      continue;
    }
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group)!.push(page);
  }

  const alternates = new Map<string, Array<{ hreflang: string; href: string }>>();

  for (const siblings of groups.values()) {
    const baseSlug = (
      siblings.find((s) => String(s.locale).toLowerCase() === String(defaultLanguage ?? '').toLowerCase())
      ?? (wanted ? siblings.find((s) => baseSubtag(String(s.locale)) === wanted) : undefined)
    )?.slug ?? null;

    for (const sibling of siblings) {
      canonicalPath.set(
        sibling.slug,
        pagePath(sibling.slug, sibling.locale, defaultLanguage, baseSlug, homepageSlug),
      );
    }

    if (siblings.length < 2) continue;

    const set = siblings.map((s) => ({
      hreflang: String(s.locale).toLowerCase(),
      href: abs(canonicalPath.get(s.slug)!),
    }));
    const fallback = wanted
      ? (siblings.find((s) => String(s.locale).toLowerCase() === String(defaultLanguage).toLowerCase())
        ?? siblings.find((s) => baseSubtag(String(s.locale)) === wanted))
      : undefined;
    if (fallback) set.push({ hreflang: 'x-default', href: abs(canonicalPath.get(fallback.slug)!) });

    for (const sibling of siblings) alternates.set(sibling.slug, set);
  }

  return { canonicalPath, alternates };
}
