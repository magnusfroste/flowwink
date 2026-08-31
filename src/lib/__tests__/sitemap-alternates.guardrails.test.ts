import { describe, it, expect } from 'vitest';
import { sitemapAlternates } from '../../../supabase/functions/_shared/sitemap-alternates.ts';

const BASE = 'https://x.se';
const ARGS = { defaultLanguage: 'sv', baseUrl: BASE, homepageSlug: 'home' };
const PAIR = [
  { slug: 'product', locale: 'sv', translation_group_id: 'g1' },
  { slug: 'product-en', locale: 'en', translation_group_id: 'g1' },
];

/**
 * Sitemapen är den ENDA kanal en sökmotor läser utan att köra JavaScript.
 * Adressformen speglar src/lib/language-path.ts (edge-bundlingen når inte
 * src/) — de här fallen är kontraktet mellan tvillingarna: ändra den ena,
 * ändra båda.
 */
describe('sitemapens adressering', () => {
  it('en sida utan syskon får ingen alternativuppsättning men en kanonisk sökväg', () => {
    const { alternates, canonicalPath } = sitemapAlternates({
      pages: [{ slug: 'villkor', locale: 'sv', translation_group_id: null }], ...ARGS,
    });
    expect(alternates.size).toBe(0);
    expect(canonicalPath.get('villkor')).toBe('/villkor');
  });

  it('icke-standardspråk adresseras som /lang/<basslugg>, aldrig egen -en-slug', () => {
    const { canonicalPath, alternates } = sitemapAlternates({ pages: PAIR, ...ARGS });
    expect(canonicalPath.get('product')).toBe('/product');
    expect(canonicalPath.get('product-en')).toBe('/en/product');
    const set = alternates.get('product')!;
    expect(set).toEqual(alternates.get('product-en'));
    expect(set.filter((a) => a.hreflang !== 'x-default')).toEqual([
      { hreflang: 'sv', href: `${BASE}/product` },
      { hreflang: 'en', href: `${BASE}/en/product` },
    ]);
  });

  it('x-default pekar på sajtens språk', () => {
    const { alternates } = sitemapAlternates({ pages: PAIR, ...ARGS, defaultLanguage: 'sv-SE' });
    expect(alternates.get('product')!.find((a) => a.hreflang === 'x-default')?.href)
      .toBe(`${BASE}/product`);
  });

  it('utan deklarerat språk utelämnas x-default hellre än gissas', () => {
    const { alternates } = sitemapAlternates({ pages: PAIR, ...ARGS, defaultLanguage: '' });
    expect(alternates.get('product')!.some((a) => a.hreflang === 'x-default')).toBe(false);
  });

  it('startsidan: roten för standardspråket, bara prefixet för det andra', () => {
    const { canonicalPath, alternates } = sitemapAlternates({
      pages: [
        { slug: 'home', locale: 'sv', translation_group_id: 'g' },
        { slug: 'home-en', locale: 'en', translation_group_id: 'g' },
      ], ...ARGS,
    });
    expect(canonicalPath.get('home')).toBe('/');
    expect(canonicalPath.get('home-en')).toBe('/en');
    expect(alternates.get('home')!.find((a) => a.hreflang === 'sv')?.href).toBe(`${BASE}/`);
    expect(alternates.get('home')!.find((a) => a.hreflang === 'en')?.href).toBe(`${BASE}/en`);
  });

  it('en sida utan locale i en grupp hoppas över i stället för att bli hreflang=""', () => {
    const { alternates } = sitemapAlternates({
      pages: [
        { slug: 'a', locale: 'sv', translation_group_id: 'g' },
        { slug: 'b', locale: null, translation_group_id: 'g' },
      ], ...ARGS,
    });
    expect(alternates.size).toBe(0);
  });
});
