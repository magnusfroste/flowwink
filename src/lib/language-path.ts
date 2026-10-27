import { baseSubtag } from './pick-locale';

/**
 * The address form for a translated page, in ONE place.
 *
 * The default language owns the root: `/product` is Swedish on a Swedish site,
 * exactly as before — nothing the operator built moves. Every other language
 * gets a prefix on the GROUP's base slug: `/en/product`, not `/product-en`.
 *
 * The `-en` suffix was the tooling's choice, not a design: the language lived
 * in a naming convention. With the prefix it lives in the address's shape —
 * scales to a third language (`/de/product`), and the base slug stays clean.
 *
 * This is ADDITIVE. Storage is untouched: the English row still has slug
 * `product-en` in the database, and the old address still resolves (then
 * redirects). The prefix is presentation on top, which is what makes the
 * change safe days before a launch — the old path is the fallback.
 *
 * Seven consumers must agree on this shape — the page's canonical, the
 * switcher, the nav, hreflang, the sitemap, the prerender and the redirect.
 * Seven hand-rolled spellings is how one of them drifts, so they all call
 * this.
 */
export interface PagePathInput {
  /** The row's own slug, e.g. 'product-en'. */
  slug: string;
  /** The row's language. Missing means the site's own. */
  locale?: string | null;
  /** The site's declared default language. */
  defaultLanguage: string;
  /**
   * The slug of the DEFAULT-language sibling in the same group, when known.
   * That is what appears after the prefix: /en/product. Unknown (no sibling,
   * or not yet loaded) falls back to the row's own slug — an uglier address
   * that still resolves, never a broken one.
   */
  baseSlug?: string | null;
  /** The slug served at '/'. Its path is the bare root, per language. */
  homepageSlug?: string;
  /**
   * The version's OWN slug in its language — an overlay's translated slug
   * (content_translations.slug). Wins after the prefix: /villkor in Swedish,
   * /en/terms in English. The same rule the blog follows (blog-address.ts).
   */
  pathSlug?: string | null;
}

export function pagePath({ slug, locale, defaultLanguage, baseSlug, homepageSlug, pathSlug }: PagePathInput): string {
  const lang = String(locale ?? '').trim().toLowerCase();
  const isDefault = !lang || baseSubtag(lang) === baseSubtag(defaultLanguage);

  if (isDefault) {
    return slug === homepageSlug ? '/' : `/${slug}`;
  }

  const base = String(baseSlug ?? '').trim() || slug;
  // The homepage in another language is the bare prefix: /en — not /en/home.
  if (homepageSlug && base === homepageSlug) return `/${lang}`;
  const own = String(pathSlug ?? '').trim();
  return `/${lang}/${own || base}`;
}

/**
 * Reads a language prefix off a URL path, against the declared language set.
 *
 * `/en/product` → { lang: 'en', slug: 'product' }; `/en` → the English
 * homepage; `/product` → no prefix. Only DECLARED non-default languages count
 * as prefixes — `/blog/...` and every other route must never be mistaken for
 * one, which is why this takes the enabled set instead of pattern-matching
 * two-letter segments.
 */
export function splitLanguagePrefix(
  path: string,
  enabledLanguages: Iterable<string>,
  defaultLanguage: string,
): { lang: string | null; rest: string } {
  const clean = String(path ?? '').replace(/\/+$/, '') || '/';
  const segments = clean.split('/').filter(Boolean);
  if (segments.length === 0) return { lang: null, rest: '/' };

  const first = segments[0].toLowerCase();
  const enabled = new Set([...enabledLanguages].map((l) => String(l).toLowerCase()));
  const isPrefix = enabled.has(first) && baseSubtag(first) !== baseSubtag(defaultLanguage);
  if (!isPrefix) return { lang: null, rest: clean };

  return { lang: first, rest: '/' + segments.slice(1).join('/') };
}

/**
 * The blog's address per language — /blog/<slug> in the site language,
 * /<lang>/blog/<slug> otherwise — owned by ONE module the edge (sitemap) and
 * api/html.ts share with the app. Re-exported here so every app consumer
 * imports addresses from one place.
 */
export { blogIndexPath, blogPostPath, isSiteLanguage, postAlternates, postVersions } from '../../supabase/functions/_shared/i18n/blog-address';
export type { PostVersion } from '../../supabase/functions/_shared/i18n/blog-address';
export { productPath, shopAlternates, shopIndexPath, shopVersions } from '../../supabase/functions/_shared/i18n/shop-address';
export type { ShopVersion } from '../../supabase/functions/_shared/i18n/shop-address';
