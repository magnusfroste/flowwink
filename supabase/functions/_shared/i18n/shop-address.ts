/**
 * The shop's address per language — /shop and /shop/<id> in the site language,
 * /<lang>/shop and /<lang>/shop/<id> otherwise — owned by ONE module the app,
 * the sitemap and content-api share (the blog rule, page-translations.md §9,
 * applied to the shop in §10). A product has no slug: its id is its address
 * in every language, so a translated name never moves a product.
 */
// Self-contained on purpose, like blog-address.ts: api/html.ts (a Vercel edge
// function) bundles this through src/lib/language-path, and that bundler does
// not take a `.ts`-suffixed import the way Deno and Vite do.
function isSiteLanguage(locale: string | null | undefined, defaultLanguage: string): boolean {
  const base = (tag: string | null | undefined) => String(tag ?? '').trim().toLowerCase().split('-')[0];
  const l = base(locale);
  return !l || l === base(defaultLanguage);
}

export function shopIndexPath(locale: string | null | undefined, defaultLanguage: string, tail = ''): string {
  const base = isSiteLanguage(locale, defaultLanguage) ? '/shop' : `/${String(locale).trim().toLowerCase()}/shop`;
  return `${base}${tail}`;
}

export function productPath(id: string, locale: string | null | undefined, defaultLanguage: string): string {
  return shopIndexPath(locale, defaultLanguage, `/${id}`);
}

export interface ShopVersion {
  locale: string;
  href: string;
}

/** Every enabled language has the shop (products fall back to their source text), so every language is a version. */
export function shopVersions(languages: string[], defaultLanguage: string, pathFor: (locale: string) => string): ShopVersion[] {
  const seen = new Set<string>();
  const out: ShopVersion[] = [];
  for (const raw of [defaultLanguage, ...(languages ?? [])]) {
    const l = String(raw ?? '').trim().toLowerCase();
    if (!l || seen.has(l)) continue;
    seen.add(l);
    out.push({ locale: l, href: pathFor(l) });
  }
  return out;
}

export function shopAlternates(versions: ShopVersion[], defaultLanguage: string, baseUrl: string): Array<{ hreflang: string; href: string }> {
  const root = String(baseUrl ?? '').replace(/\/+$/, '');
  const out = versions.map((v) => ({ hreflang: v.locale, href: `${root}${v.href}` }));
  const def = versions.find((v) => isSiteLanguage(v.locale, defaultLanguage)) ?? versions[0];
  if (def) out.push({ hreflang: 'x-default', href: `${root}${def.href}` });
  return out;
}
