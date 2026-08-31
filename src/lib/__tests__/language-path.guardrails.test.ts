import { describe, it, expect } from 'vitest';
import { pagePath, splitLanguagePrefix } from '../language-path';

/**
 * Adressformen för språkversioner: standardspråket äger roten, andra språk får
 * prefix på GRUPPENS basslugg. Sju konsumenter (canonical, växlare, nav,
 * hreflang, sitemap, prerender, redirect) anropar samma funktion — de här
 * fallen är kontraktet de delar.
 */
describe('pagePath', () => {
  const SV = { defaultLanguage: 'sv', homepageSlug: 'home' };

  it('standardspråket äger roten — ingenting flyttar', () => {
    expect(pagePath({ slug: 'product', locale: 'sv', ...SV })).toBe('/product');
    expect(pagePath({ slug: 'home', locale: 'sv', ...SV })).toBe('/');
    expect(pagePath({ slug: 'villkor', locale: null, ...SV })).toBe('/villkor');
  });

  it('andra språk får prefix på GRUPPENS basslugg, inte sin egen', () => {
    expect(pagePath({ slug: 'product-en', locale: 'en', baseSlug: 'product', ...SV }))
      .toBe('/en/product');
  });

  it('startsidan i annat språk är bara prefixet', () => {
    expect(pagePath({ slug: 'home-en', locale: 'en', baseSlug: 'home', ...SV })).toBe('/en');
  });

  it('utan känt syskon faller den till egen slug — fult men aldrig brutet', () => {
    expect(pagePath({ slug: 'product-en', locale: 'en', ...SV })).toBe('/en/product-en');
  });

  it('regionstagg räknas som samma språk som standarden', () => {
    expect(pagePath({ slug: 'product', locale: 'sv-SE', ...SV })).toBe('/product');
  });
});

describe('splitLanguagePrefix', () => {
  const ENABLED = ['sv', 'en'];

  it('läser prefixet bara för DEKLARERADE icke-standardspråk', () => {
    expect(splitLanguagePrefix('/en/product', ENABLED, 'sv')).toEqual({ lang: 'en', rest: '/product' });
    expect(splitLanguagePrefix('/de/product', ENABLED, 'sv')).toEqual({ lang: null, rest: '/de/product' });
  });

  it('/en ensamt är den engelska startsidan', () => {
    expect(splitLanguagePrefix('/en', ENABLED, 'sv')).toEqual({ lang: 'en', rest: '/' });
    expect(splitLanguagePrefix('/en/', ENABLED, 'sv')).toEqual({ lang: 'en', rest: '/' });
  });

  it('standardspråket är aldrig ett prefix — /sv/x vore en dubblettadress', () => {
    expect(splitLanguagePrefix('/sv/product', ENABLED, 'sv')).toEqual({ lang: null, rest: '/sv/product' });
  });

  it('vanliga sökvägar passerar orörda', () => {
    expect(splitLanguagePrefix('/product', ENABLED, 'sv')).toEqual({ lang: null, rest: '/product' });
    expect(splitLanguagePrefix('/', ENABLED, 'sv')).toEqual({ lang: null, rest: '/' });
    expect(splitLanguagePrefix('/blog/post', ENABLED, 'sv')).toEqual({ lang: null, rest: '/blog/post' });
  });

  it('en sida som råkar heta som ett språk skyddas av deklarationen', () => {
    // "en" är prefix ENDAST för att sajten deklarerat engelska. En sajt utan
    // engelska behåller /en som vanlig slug.
    expect(splitLanguagePrefix('/en/product', ['sv'], 'sv')).toEqual({ lang: null, rest: '/en/product' });
  });
});
