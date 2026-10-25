/**
 * The address of a blog post per language, and its language versions.
 *
 * Same rule as pages (src/lib/language-path.ts `pagePath`): the site's
 * language owns the root, every other language gets a prefix —
 *
 *   /blog/<slug>            the post in the site language
 *   /<lang>/blog/<slug>     the post in any other language
 *   /blog, /<lang>/blog     the archive; /category/x, /tag/x, /author/x below it
 *
 * The address follows the LANGUAGE SHOWN, not the post's source language: on
 * an English site a Swedish-written post lives at /sv/blog/<slug> and its
 * English overlay at /blog/<slug>. `<slug>` is the overlay's own slug when it
 * has one, else the post's.
 *
 * One module, imported by the edge (sitemap), the app (blog pages, the
 * switcher) and api/html.ts through src/lib/language-path.ts — the twin the
 * page address has (sitemap-alternates.ts) is not repeated here.
 *
 * Design: docs/architecture/page-translations.md §9.
 */

/** 'sv-SE' → 'sv' */
function baseSubtag(tag: string | null | undefined): string {
  return String(tag ?? '').trim().toLowerCase().split('-')[0];
}

/** True when `locale` is the site's own language (or unset — the site's by default). */
export function isSiteLanguage(locale: string | null | undefined, defaultLanguage: string): boolean {
  const l = String(locale ?? '').trim().toLowerCase();
  return !l || baseSubtag(l) === baseSubtag(defaultLanguage);
}

/** '/blog' or '/sv/blog', plus an optional tail ('/category/x'). */
export function blogIndexPath(locale: string | null | undefined, defaultLanguage: string, tail = ''): string {
  const t = tail ? (tail.startsWith('/') ? tail : `/${tail}`) : '';
  if (isSiteLanguage(locale, defaultLanguage)) return `/blog${t}`;
  return `/${String(locale).trim().toLowerCase()}/blog${t}`;
}

/** '/blog/<slug>' or '/<lang>/blog/<slug>'. */
export function blogPostPath(slug: string, locale: string | null | undefined, defaultLanguage: string): string {
  return blogIndexPath(locale, defaultLanguage, `/${slug}`);
}

/** A post's source row, as far as addressing needs it. */
export interface PostSource {
  slug: string;
  locale?: string | null;
  title?: string | null;
}

/** An overlay row of a post, as far as addressing needs it. */
export interface PostOverlay {
  locale: string;
  status?: string | null;
  slug?: string | null;
  strings?: Record<string, { text?: string } | undefined> | null;
}

export interface PostVersion {
  locale: string;
  /** The slug in this language: the overlay's own, or the post's. */
  slug: string;
  title: string;
  source: 'post' | 'overlay';
  /** The path in this language — '/blog/x' or '/sv/blog/x'. */
  href: string;
}

/**
 * Every published language version of a post: the post itself in its own
 * language, plus each PUBLISHED overlay. A draft overlay is not a version.
 */
export function postVersions(post: PostSource, overlays: PostOverlay[] | null | undefined, defaultLanguage: string): PostVersion[] {
  const own = String(post.locale ?? defaultLanguage).trim().toLowerCase() || String(defaultLanguage).toLowerCase();
  const out: PostVersion[] = [{
    locale: own, slug: post.slug, title: String(post.title ?? ''), source: 'post',
    href: blogPostPath(post.slug, own, defaultLanguage),
  }];
  for (const o of overlays ?? []) {
    const l = String(o?.locale ?? '').trim().toLowerCase();
    if (!l || l === own || (o.status && o.status !== 'published')) continue;
    if (out.some((v) => v.locale === l)) continue;
    const slug = String(o.slug ?? '').trim() || post.slug;
    const title = o.strings?.['post.title']?.text?.trim() || String(post.title ?? '');
    out.push({ locale: l, slug, title, source: 'overlay', href: blogPostPath(slug, l, defaultLanguage) });
  }
  return out;
}

/**
 * The hreflang set for a post's versions: every version lists every version,
 * absolute URLs, x-default on the site-language version when there is one.
 * A post in one language has no set.
 */
export function postAlternates(versions: PostVersion[], defaultLanguage: string, baseUrl: string): Array<{ hreflang: string; href: string }> {
  const origin = String(baseUrl ?? '').replace(/\/+$/, '');
  if (!origin || versions.length < 2) return [];
  const set = versions.map((v) => ({ hreflang: v.locale, href: `${origin}${v.href}` }));
  const fallback = versions.find((v) => isSiteLanguage(v.locale, defaultLanguage));
  if (fallback) set.push({ hreflang: 'x-default', href: `${origin}${fallback.href}` });
  return set;
}
