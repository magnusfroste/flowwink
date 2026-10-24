import { describe, it, expect } from 'vitest';
import { resolvePageInLocale } from '../../../supabase/functions/_shared/i18n/resolve-page';
import { collectUnits, type OverlayEntry } from '../../../supabase/functions/_shared/i18n/translation-units';
import { structureSignature } from '../../../supabase/functions/_shared/i18n/translate-walk';

const page = {
  id: 'p1', slug: 'tjanster', locale: 'sv', status: 'published',
  title: 'Tjänster',
  meta_json: { seoTitle: 'Tjänster — Synclair', description: 'Tre sätt att börja.' },
  content_json: [
    { id: 'b1', type: 'hero', data: { title: 'Våra tjänster', subtitle: 'Tre sätt att börja', buttonText: 'Boka möte', buttonUrl: '/kontakt' } },
    { id: 'b2', type: 'features', data: { items: [{ title: 'Rådgivning', description: 'Vi hjälper er välja.' }, { title: 'Installation', description: 'Vi monterar.' }] } },
  ],
};

const en = (patch: Record<string, string>): Record<string, OverlayEntry> => {
  const units = collectUnits(page);
  return Object.fromEntries(Object.entries(patch).map(([unit, text]) => {
    const u = units.find((x) => x.unit === unit)!;
    return [unit, { text, source_hash: u.hash }];
  }));
};

describe('resolvePageInLocale — the source structure with the overlay\'s text (page-translations.md §2.3)', () => {
  it('no overlay: the page as is, in its own language, nothing to report', () => {
    const r = resolvePageInLocale(page, null);
    expect(r.page).toEqual(page);
    expect(r.page).not.toBe(page);
    expect(r.locale).toBe('sv');
    expect(r.fallback_units).toEqual([]);
    expect(r.coverage).toBe(100);
    expect(r.units_total).toBe(10);
  });

  it('a complete overlay: every string replaced, structure and non-text identical, coverage 100', () => {
    const strings = en({
      'page.title': 'Services', 'page.meta.seoTitle': 'Services — Synclair', 'page.meta.description': 'Three ways to start.',
      'b1.data.title': 'Our services', 'b1.data.subtitle': 'Three ways to start', 'b1.data.buttonText': 'Book a meeting',
      'b2.data.items[0].title': 'Advisory', 'b2.data.items[0].description': 'We help you choose.',
      'b2.data.items[1].title': 'Installation', 'b2.data.items[1].description': 'We install.',
    });
    const r = resolvePageInLocale(page, { locale: 'en', status: 'published', slug: 'services', strings });
    expect(r.locale).toBe('en');
    expect(r.slug).toBe('services');
    expect(r.coverage).toBe(100);
    expect(r.fallback_units).toEqual([]);
    expect(r.page.title).toBe('Services');
    expect(r.page.meta_json.seoTitle).toBe('Services — Synclair');
    expect(r.page.content_json[0].data.title).toBe('Our services');
    expect(r.page.content_json[0].data.buttonUrl).toBe('/kontakt');
    expect(r.page.content_json[1].data.items[1].description).toBe('We install.');
    expect(r.page.id).toBe('p1');
    expect(r.page.slug).toBe('tjanster'); // the row's slug is identity; the address is pagePath's business
    expect(structureSignature(r.page.content_json)).toBe(structureSignature(page.content_json));
  });

  it('a partial overlay: missing units keep the source text, VISIBLY, and are named and counted', () => {
    const strings = en({ 'page.title': 'Services', 'b1.data.title': 'Our services' });
    const r = resolvePageInLocale(page, { locale: 'en', status: 'published', strings });
    expect(r.page.title).toBe('Services');
    expect(r.page.content_json[0].data.subtitle).toBe('Tre sätt att börja');
    expect(r.fallback_units).toHaveLength(8);
    expect(r.fallback_units).toContain('b1.data.subtitle');
    expect(r.coverage).toBe(20); // 2 of 10
  });

  it('a stale unit is shown (better than the source language) and named', () => {
    const strings = en({ 'page.title': 'Services', 'b1.data.title': 'Our services' });
    strings['b1.data.title'].source_hash = 'ffffffffffffffff'; // the Swedish title changed after this was written
    const r = resolvePageInLocale(page, { locale: 'en', status: 'published', strings });
    expect(r.page.content_json[0].data.title).toBe('Our services');
    expect(r.stale_units).toEqual(['b1.data.title']);
    expect(r.fallback_units).not.toContain('b1.data.title');
    expect(r.coverage).toBe(10); // only page.title is fresh
  });

  it('an orphan (a block that was deleted) is named and never rendered', () => {
    const strings = { ...en({ 'page.title': 'Services' }), 'b9.data.title': { text: 'Gone', source_hash: '0' } };
    const r = resolvePageInLocale(page, { locale: 'en', strings });
    expect(r.orphan_units).toEqual(['b9.data.title']);
    expect(JSON.stringify(r.page)).not.toContain('Gone');
  });

  it('the source page is never mutated', () => {
    const snapshot = JSON.stringify(page);
    resolvePageInLocale(page, { locale: 'en', strings: en({ 'page.title': 'Services' }) });
    expect(JSON.stringify(page)).toBe(snapshot);
  });
});
