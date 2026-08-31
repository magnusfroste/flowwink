import { baseSubtag } from './pick-locale';
import { pagePath } from './language-path';

export interface TranslatedPage {
  slug: string;
  locale: string;
}

export interface HreflangAlternate {
  hreflang: string;
  href: string;
}

export interface BuildHreflangInput {
  /** Every PUBLISHED language version of this page, including the current one. */
  translations: TranslatedPage[];
  /** Origin without a trailing slash, e.g. https://optictunnels.se */
  baseUrl: string;
  /** The slug served at "/" — its alternate must be the bare origin. */
  homepageSlug: string;
  /** The site's declared default language, which x-default points at. */
  defaultLanguage: string;
}

/**
 * The `<link rel="alternate" hreflang>` set for a translated page.
 *
 * Publishing a translation and not declaring it is most of the way to wasting
 * it: a search engine that cannot see that /priser and /pricing are the same
 * page in two languages will pick one, and may treat the other as duplicate
 * content in the wrong market. That is the whole reason FlowWink stores a page
 * per language instead of two strings in one row — this is where the reason
 * pays off.
 *
 * Three rules that are easy to get silently wrong:
 *
 *   1. SELF-REFERENCE. Every version must list every version, itself included.
 *      A set that omits the current page is ignored.
 *   2. ABSOLUTE URLs. Relative hrefs are not honoured.
 *   3. x-default. Points at the version a visitor with no better match should
 *      get — the site's default language, not "the first one".
 *
 * Returns an empty array when there is nothing to declare, so a single-language
 * site emits no tags at all rather than a set of one.
 */
export function buildHreflangAlternates({
  translations,
  baseUrl,
  homepageSlug,
  defaultLanguage,
}: BuildHreflangInput): HreflangAlternate[] {
  const origin = String(baseUrl ?? '').replace(/\/+$/, '');
  const usable = (translations ?? []).filter((t) => t?.slug && t?.locale);
  // One version is not a set of alternates — it is just the page.
  if (!origin || usable.length < 2) return [];

  // Standardspråket äger roten; andra språk får /lang/-prefix på gruppens
  // basslugg. Samma pagePath som canonical, växlaren, navet och sitemapen —
  // en hreflang-länk får aldrig peka på en form ingen annan använder.
  const baseSlug = (
    usable.find((t) => t.locale.toLowerCase() === String(defaultLanguage ?? '').toLowerCase())
    ?? usable.find((t) => baseSubtag(t.locale) === baseSubtag(defaultLanguage))
  )?.slug ?? null;

  const href = (t: TranslatedPage) => {
    const path = pagePath({
      slug: t.slug, locale: t.locale, defaultLanguage, baseSlug, homepageSlug,
    });
    return path === '/' ? `${origin}/` : `${origin}${path}`;
  };

  const alternates: HreflangAlternate[] = usable.map((t) => ({
    hreflang: t.locale.toLowerCase(),
    href: href(t),
  }));

  const wanted = baseSubtag(defaultLanguage);
  const fallbackVersion =
    usable.find((t) => t.locale.toLowerCase() === String(defaultLanguage ?? '').toLowerCase())
    ?? usable.find((t) => baseSubtag(t.locale) === wanted);

  // No version in the site's own language means we cannot say which one a
  // stranger should get, and guessing would send the wrong market to the wrong
  // page. Better to declare the pairs and let the engine choose.
  if (fallbackVersion) {
    alternates.push({ hreflang: 'x-default', href: href(fallbackVersion) });
  }

  return alternates;
}
