import { describe, it, expect } from 'vitest';
import { pairSiblingUnits, blockIdMapByPosition } from '../../../supabase/functions/_shared/i18n/convert-siblings';
import { collectUnits } from '../../../supabase/functions/_shared/i18n/translation-units';

const sv = {
  title: 'Tjänster',
  meta_json: { seoTitle: 'Tjänster — Synclair' },
  content_json: [
    { id: 'b1', type: 'hero', data: { title: 'Våra tjänster', subtitle: 'Tre sätt att börja', buttonText: 'Boka möte', buttonUrl: '/kontakt' } },
    { id: 'b2', type: 'features', data: { items: [{ title: 'Rådgivning', description: 'Vi hjälper er välja.' }] } },
    { id: 'b3', type: 'rich-text', data: { content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Läs mer.' }] }] } } },
  ],
};
const en = {
  title: 'Services',
  meta_json: { seoTitle: 'Services — Synclair' },
  content_json: [
    { id: 'b1', type: 'hero', data: { title: 'Our services', subtitle: 'Tre sätt att börja', buttonText: 'Book a meeting', buttonUrl: '/contact' } }, // subtitle never translated
    { id: 'b2', type: 'features', data: { items: [{ title: 'Advisory', description: 'We help you choose.' }] } },
    { id: 'b3', type: 'rich-text', data: { content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Read more.' }] }] } } },
  ],
};

describe('pairSiblingUnits — a sibling row becomes an overlay (page-translations.md §6)', () => {
  it('pairs by block id, stamps the SOURCE hash, leaves untranslated copies out, reports coverage', () => {
    const r = pairSiblingUnits(sv, en);
    const src = collectUnits(sv);
    expect(r.strings['page.title']).toEqual({ text: 'Services', source_hash: src.find((u) => u.unit === 'page.title')!.hash });
    expect(r.strings['b1.data.title'].text).toBe('Our services');
    expect(r.strings['b2.data.items[0].description'].text).toBe('We help you choose.');
    expect((r.strings['b3.data.content'].doc as { content: Array<{ content: Array<{ text: string }> }> }).content[0].content[0].text).toBe('Read more.');
    expect(r.untranslated).toEqual(['b1.data.subtitle']);
    expect(r.strings['b1.data.subtitle']).toBeUndefined();
    expect(r.missing).toEqual([]);
    expect(r.extra).toEqual([]);
    expect(r.paired).toBe(7); // 8 source units (title, seoTitle, b1 ×3, b2 ×2, b3 doc); subtitle untranslated → 7
    expect(r.paired_by_position).toBe(0);
    expect(r.coverage).toBe(88); // 7 of 8
  });

  it('a block only the sibling has is the finding; a source block the sibling lacks is missing', () => {
    const enExtra = { ...en, content_json: [...en.content_json.slice(0, 2), { id: 'b9', type: 'cta', data: { title: 'Talk to us', buttonText: 'Call' } }] };
    const r = pairSiblingUnits(sv, enExtra);
    expect(r.extra.map((e) => e.unit)).toEqual(['b9.data.title', 'b9.data.buttonText']);
    expect(r.missing).toEqual(['b3.data.content']);
  });

  it('ids differ but the shape is the same → paired by position and reported as such', () => {
    const enIds = { ...en, content_json: en.content_json.map((b, i) => ({ ...b, id: `x${i}` })) };
    expect(blockIdMapByPosition(sv.content_json, enIds.content_json)).toEqual(new Map([['x0', 'b1'], ['x1', 'b2'], ['x2', 'b3']]));
    const r = pairSiblingUnits(sv, enIds);
    expect(r.strings['b1.data.title'].text).toBe('Our services');
    expect(r.paired_by_position).toBe(5); // block units paired by position (page.* are not blocks; subtitle untranslated)
    expect(r.extra).toEqual([]);
  });

  it('ids differ AND the shape differs → no position map, everything is extra or missing (the operator decides)', () => {
    const other = { title: 'Services', meta_json: {}, content_json: [{ id: 'z1', type: 'cta', data: { title: 'Different page' } }] };
    expect(blockIdMapByPosition(sv.content_json, other.content_json)).toBeNull();
    const r = pairSiblingUnits(sv, other);
    expect(r.extra.map((e) => e.unit)).toEqual(['z1.data.title']);
    expect(r.missing.length).toBeGreaterThan(0);
  });
});

describe('a moved block with a fresh id pairs by type (optic home, 2026-10-25)', () => {
  const svHome = { title: 'Hem', meta_json: {}, content_json: [
    { id: 'hero', type: 'hero', data: { title: 'Välkommen hit' } },
    { id: 'c4be70ef', type: 'two-column', data: { title: 'Kraven på kontroll ökar', text: 'Svensk brödtext här.' } },
    { id: 'gal', type: 'gallery', data: { title: 'Bilder från fält' } },
  ] };
  const enHome = { title: 'Home', meta_json: {}, content_json: [
    { id: 'hero', type: 'hero', data: { title: 'Welcome here' } },
    { id: 'gal', type: 'gallery', data: { title: 'Images from the field' } },
    { id: '53524239', type: 'two-column', data: { title: 'The need for control is growing', text: 'English body text here.' } },
  ] };
  it('the sole unmatched two-column on each side pairs, reported as paired_by_type; nothing is extra', () => {
    const r = pairSiblingUnits(svHome, enHome);
    expect(r.extra).toEqual([]);
    expect(r.strings['c4be70ef.data.title'].text).toBe('The need for control is growing');
    expect(r.paired_by_type).toBe(2);
    expect(r.missing).toEqual([]);
  });
  it('two unmatched blocks of the same type are ambiguous and stay a finding', () => {
    const en2 = { ...enHome, content_json: [...enHome.content_json, { id: 'zz', type: 'two-column', data: { title: 'Another section' } }] };
    const r = pairSiblingUnits(svHome, en2);
    expect(r.paired_by_type).toBe(0);
    expect(r.extra.length).toBeGreaterThan(0);
  });
});
