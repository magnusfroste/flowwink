import { describe, it, expect } from 'vitest';
import { pagesInWorkingLanguage } from '../page-language-grouping';

const p = (slug: string, locale?: string | null, group?: string | null) =>
  ({ slug, locale, translation_group_id: group });

describe('adminlistan visar ett språk i taget', () => {
  const OPTIC = [
    p('home', 'sv', 'g1'), p('home-en', 'en', 'g1'),
    p('product', 'sv', 'g2'), p('product-en', 'en', 'g2'),
    p('villkor', 'sv', null),
  ];

  it('en enspråkig sajt påverkas INTE alls', () => {
    const single = [p('home', 'en', null), p('about', 'en', null)];
    expect(pagesInWorkingLanguage(single, 'en', false)).toBe(single);
    expect(pagesInWorkingLanguage(OPTIC, 'sv', false)).toBe(OPTIC);
  });

  it('en översättningsgrupp ger exakt en rad', () => {
    const rows = pagesInWorkingLanguage(OPTIC, 'sv', true);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.slug).sort()).toEqual(['home', 'product', 'villkor']);
  });

  it('byter språk utan att antalet rader ändras', () => {
    const rows = pagesInWorkingLanguage(OPTIC, 'en', true);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.slug).sort()).toEqual(['home-en', 'product-en', 'villkor']);
  });

  it('en sida utan grupp följer alltid med — den hör till alla språk', () => {
    expect(pagesInWorkingLanguage(OPTIC, 'de', true).map((r) => r.slug)).toContain('villkor');
  });

  it('en grupp utan version i språket FÖRSVINNER INTE — den visas som den är', () => {
    const rows = pagesInWorkingLanguage(OPTIC, 'de', true);
    expect(rows).toHaveLength(3);
    expect(rows.some((r) => r.slug === 'home' || r.slug === 'home-en')).toBe(true);
  });

  it('en-GB svarar på en begäran om en', () => {
    const rows = pagesInWorkingLanguage(
      [p('a', 'sv', 'g'), p('a-gb', 'en-GB', 'g')], 'en', true,
    );
    expect(rows.map((r) => r.slug)).toEqual(['a-gb']);
  });
});
