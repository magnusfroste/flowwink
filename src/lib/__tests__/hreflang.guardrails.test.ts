import { describe, it, expect } from 'vitest';
import { buildHreflangAlternates } from '../hreflang';

const BASE = 'https://optictunnels.se';
const PAIR = [
  { slug: 'home', locale: 'sv' },
  { slug: 'home-en', locale: 'en' },
];

/**
 * hreflang är hela utdelningen av att lagra en sida per språk.
 *
 * Utan deklarationen väljer sökmotorn EN av versionerna och kan behandla den
 * andra som dubblettinnehåll på fel marknad — översättningen är publicerad men
 * osynlig. Tre regler går tyst fel, och alla tre pinnas här.
 */
describe('hreflang', () => {
  it('en enspråkig sida deklarerar INGENTING — inte en uppsättning om ett', () => {
    expect(buildHreflangAlternates({
      translations: [{ slug: 'about', locale: 'sv' }],
      baseUrl: BASE, homepageSlug: 'home', defaultLanguage: 'sv',
    })).toEqual([]);
  });

  it('varje version listas, den nuvarande INKLUDERAD', () => {
    // Självreferensen är kravet som oftast missas: en uppsättning som utelämnar
    // sidan man står på ignoreras i sin helhet.
    const alts = buildHreflangAlternates({
      translations: PAIR, baseUrl: BASE, homepageSlug: 'ingen', defaultLanguage: 'sv',
    });
    // Sedan /en/-prefixet: andra språk adresseras på GRUPPENS basslugg med
    // språkprefix — aldrig på sin egen -en-slug.
    expect(alts.filter((a) => a.hreflang !== 'x-default')).toEqual([
      { hreflang: 'sv', href: `${BASE}/home` },
      { hreflang: 'en', href: `${BASE}/en/home` },
    ]);
  });

  it('adresserna är absoluta — relativa hedras inte', () => {
    const alts = buildHreflangAlternates({
      translations: PAIR, baseUrl: BASE, homepageSlug: 'home', defaultLanguage: 'sv',
    });
    for (const alt of alts) expect(alt.href.startsWith('https://')).toBe(true);
  });

  it('startsidan får den bara origin, inte /home', () => {
    const alts = buildHreflangAlternates({
      translations: PAIR, baseUrl: BASE, homepageSlug: 'home', defaultLanguage: 'sv',
    });
    expect(alts.find((a) => a.hreflang === 'sv')?.href).toBe(`${BASE}/`);
    // Startsidan i annat språk är bara prefixet.
    expect(alts.find((a) => a.hreflang === 'en')?.href).toBe(`${BASE}/en`);
  });

  it('x-default pekar på SAJTENS språk, inte på den första i listan', () => {
    const alts = buildHreflangAlternates({
      translations: PAIR, baseUrl: BASE, homepageSlug: 'ingen', defaultLanguage: 'en',
    });
    // Här ÄR engelska standardspråket, så dess adress är rotformen med egen
    // slug — prefix får bara icke-standardspråk.
    expect(alts.find((a) => a.hreflang === 'x-default')?.href).toBe(`${BASE}/home-en`);
  });

  it('x-default matchar även på grundtaggen', () => {
    const alts = buildHreflangAlternates({
      translations: PAIR, baseUrl: BASE, homepageSlug: 'ingen', defaultLanguage: 'sv-SE',
    });
    expect(alts.find((a) => a.hreflang === 'x-default')?.href).toBe(`${BASE}/home`);
  });

  it('utan version i sajtens språk utelämnas x-default hellre än gissas', () => {
    const alts = buildHreflangAlternates({
      translations: PAIR, baseUrl: BASE, homepageSlug: 'ingen', defaultLanguage: 'de',
    });
    expect(alts.some((a) => a.hreflang === 'x-default')).toBe(false);
    expect(alts).toHaveLength(2);
  });

  it('en trailing slash i basadressen ger inte dubbla snedstreck', () => {
    const alts = buildHreflangAlternates({
      translations: PAIR, baseUrl: `${BASE}/`, homepageSlug: 'ingen', defaultLanguage: 'sv',
    });
    expect(alts[0].href).toBe(`${BASE}/home`);
  });

  it('halva rader ignoreras i stället för att bli trasiga länkar', () => {
    expect(buildHreflangAlternates({
      translations: [{ slug: 'home', locale: 'sv' }, { slug: '', locale: 'en' }],
      baseUrl: BASE, homepageSlug: 'ingen', defaultLanguage: 'sv',
    })).toEqual([]);
  });
});
