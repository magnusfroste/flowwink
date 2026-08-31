import { describe, it, expect } from 'vitest';
import { sitemapAlternates } from '../../../supabase/functions/_shared/sitemap-alternates.ts';

const href = (slug: string) => (slug === 'home' ? 'https://x.se' : `https://x.se/${slug}`);
const PAIR = [
  { slug: 'product', locale: 'sv', translation_group_id: 'g1' },
  { slug: 'product-en', locale: 'en', translation_group_id: 'g1' },
];

/**
 * Sitemapen är den ENDA kanal en sökmotor läser utan att köra JavaScript:
 * hreflang i huvudet kommer från react-helmet, och den här instansens
 * prerender körs bara för SOCIALA crawlers. Utan detta ser Google fjorton
 * orelaterade adresser, varav hälften liknar dubblettinnehåll på fel marknad.
 */
describe('sitemapens språkalternativ', () => {
  it('en sida utan syskon får inga alternativ', () => {
    const m = sitemapAlternates({
      pages: [{ slug: 'villkor', locale: 'sv', translation_group_id: null }],
      defaultLanguage: 'sv', href,
    });
    expect(m.size).toBe(0);
  });

  it('en ensam sida i en grupp räknas inte som en uppsättning', () => {
    const m = sitemapAlternates({
      pages: [{ slug: 'a', locale: 'sv', translation_group_id: 'g' }],
      defaultLanguage: 'sv', href,
    });
    expect(m.size).toBe(0);
  });

  it('båda versionerna får SAMMA uppsättning, sig själva inkluderade', () => {
    const m = sitemapAlternates({ pages: PAIR, defaultLanguage: 'sv', href });
    const sv = m.get('product')!;
    const en = m.get('product-en')!;
    expect(sv).toEqual(en);
    expect(sv.filter((a) => a.hreflang !== 'x-default')).toEqual([
      { hreflang: 'sv', href: 'https://x.se/product' },
      { hreflang: 'en', href: 'https://x.se/product-en' },
    ]);
  });

  it('x-default pekar på sajtens språk', () => {
    const m = sitemapAlternates({ pages: PAIR, defaultLanguage: 'sv-SE', href });
    expect(m.get('product')!.find((a) => a.hreflang === 'x-default')?.href)
      .toBe('https://x.se/product');
  });

  it('utan deklarerat språk utelämnas x-default hellre än gissas', () => {
    const m = sitemapAlternates({ pages: PAIR, defaultLanguage: '', href });
    expect(m.get('product')!.some((a) => a.hreflang === 'x-default')).toBe(false);
  });

  it('startsidan får bara origin — samma href-funktion som <loc>', () => {
    const m = sitemapAlternates({
      pages: [
        { slug: 'home', locale: 'sv', translation_group_id: 'g' },
        { slug: 'home-en', locale: 'en', translation_group_id: 'g' },
      ],
      defaultLanguage: 'sv', href,
    });
    expect(m.get('home')!.find((a) => a.hreflang === 'sv')?.href).toBe('https://x.se');
  });

  it('en sida utan locale hoppas över i stället för att bli hreflang=""', () => {
    const m = sitemapAlternates({
      pages: [
        { slug: 'a', locale: 'sv', translation_group_id: 'g' },
        { slug: 'b', locale: null, translation_group_id: 'g' },
      ],
      defaultLanguage: 'sv', href,
    });
    expect(m.size).toBe(0);
  });
});
