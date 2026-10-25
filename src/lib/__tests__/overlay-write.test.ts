import { describe, it, expect } from 'vitest';
import { collectUnits, unitHash, type OverlayEntry } from '../../../supabase/functions/_shared/i18n/translation-units';
import { planOverlayWrite, numberForTranslation, assembleOverlay, coverageOf } from '../../../supabase/functions/_shared/i18n/overlay-write';

const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Läs ' }, { type: 'text', text: 'mer', marks: [{ type: 'bold' }] }] }] };
const page = {
  title: 'Tjänster',
  meta_json: {},
  content_json: [
    { id: 'b1', type: 'hero', data: { title: 'Våra tjänster', buttonText: 'Boka möte', buttonUrl: '/kontakt' } },
    { id: 'b2', type: 'rich-text', data: { content: doc } },
  ],
};
const units = collectUnits(page); // page.title, b1.data.title, b1.data.buttonText, b2.data.content
const h = (unit: string) => units.find((u) => u.unit === unit)!.hash;

describe('planOverlayWrite — translate what is missing or stale, keep what is fresh (page-translations.md §2.2)', () => {
  it('an empty overlay translates everything, keeps nothing', () => {
    const plan = planOverlayWrite(units, null);
    expect(plan.translate.map((u) => u.unit)).toEqual(['page.title', 'b1.data.title', 'b1.data.buttonText', 'b2.data.content']);
    expect(plan.keep).toEqual({});
    expect(plan.total).toBe(4);
  });

  it('a fresh hand-polished entry is kept; a stale one and a missing one are translated; an orphan is named', () => {
    const strings: Record<string, OverlayEntry> = {
      'page.title': { text: 'Services (polished by a human)', source_hash: h('page.title') },
      'b1.data.title': { text: 'Old title', source_hash: 'ffffffffffffffff' },
      'b9.data.gone': { text: 'Gone', source_hash: '0' },
    };
    const plan = planOverlayWrite(units, strings);
    expect(Object.keys(plan.keep)).toEqual(['page.title']);
    expect(plan.keep['page.title'].text).toBe('Services (polished by a human)');
    expect(plan.stale).toEqual(['b1.data.title']);
    expect(plan.missing).toEqual(['b1.data.buttonText', 'b2.data.content']);
    expect(plan.translate.map((u) => u.unit)).toEqual(['b1.data.buttonText', 'b2.data.content', 'b1.data.title']);
    expect(plan.orphans).toEqual(['b9.data.gone']);
  });

  it('force retranslates everything, including fresh entries', () => {
    const strings: Record<string, OverlayEntry> = { 'page.title': { text: 'Services', source_hash: h('page.title') } };
    const plan = planOverlayWrite(units, strings, { force: true });
    expect(plan.translate).toHaveLength(4);
    expect(plan.keep).toEqual({});
  });
});

describe('numberForTranslation + assembleOverlay — the model sees strings, the overlay stores units', () => {
  it('a text unit is one item; a doc unit is one item per text node', () => {
    const plan = planOverlayWrite(units, null);
    const n = numberForTranslation(plan.translate);
    expect(n.items.map((it) => it.text)).toEqual(['Tjänster', 'Våra tjänster', 'Boka möte', 'Läs ', 'mer']);
    expect(n.owners[3].unit.unit).toBe('b2.data.content');
    expect(n.owners[3].nodePath).toEqual(['content', 0, 'content', 0, 'text']);
  });

  it('a fully delivered run writes every unit with the CURRENT source hash; coverage 100', () => {
    const plan = planOverlayWrite(units, null);
    const n = numberForTranslation(plan.translate);
    const got = new Map<number, string>([[0, 'Services'], [1, 'Our services'], [2, 'Book a meeting'], [3, 'Read '], [4, 'more']]);
    const out = assembleOverlay(plan, n, got);
    expect(out.translated).toEqual(['page.title', 'b1.data.title', 'b1.data.buttonText', 'b2.data.content']);
    expect(out.untranslated).toEqual([]);
    expect(out.coverage).toBe(100);
    expect(out.strings['b1.data.title']).toEqual({ text: 'Our services', source_hash: h('b1.data.title') });
    const d = out.strings['b2.data.content'].doc as typeof doc;
    expect(d.content[0].content[0].text).toBe('Read ');
    expect(d.content[0].content[1].text).toBe('more');
    expect(d.content[0].content[1].marks).toEqual([{ type: 'bold' }]); // marks survive
    expect(out.strings['b2.data.content'].source_hash).toBe(h('b2.data.content'));
    expect(coverageOf(units, out.strings)).toBe(100);
  });

  it('a doc with one node missing is NOT written half-done; a kept entry stays; coverage counts honestly', () => {
    const strings: Record<string, OverlayEntry> = { 'page.title': { text: 'Services', source_hash: h('page.title') } };
    const plan = planOverlayWrite(units, strings);
    const n = numberForTranslation(plan.translate); // b1.title, b1.buttonText, doc node 0, doc node 1
    const got = new Map<number, string>([[0, 'Our services'], [1, 'Book a meeting'], [2, 'Read ']]); // node 1 missing
    const out = assembleOverlay(plan, n, got);
    expect(out.translated).toEqual(['b1.data.title', 'b1.data.buttonText']);
    expect(out.untranslated).toEqual(['b2.data.content']);
    expect(out.strings['b2.data.content']).toBeUndefined();
    expect(out.strings['page.title'].text).toBe('Services');
    expect(out.coverage).toBe(75); // 1 kept + 2 translated of 4
  });

  it('a stale unit the model did not deliver keeps its old entry (better than the source), still counted untranslated', () => {
    const strings: Record<string, OverlayEntry> = { 'b1.data.title': { text: 'Old but English', source_hash: 'ffffffffffffffff' } };
    const plan = planOverlayWrite(units, strings);
    const n = numberForTranslation(plan.translate);
    const out = assembleOverlay(plan, n, new Map(), strings); // the model delivered nothing
    expect(out.untranslated).toHaveLength(4);
    expect(out.strings['b1.data.title']).toEqual({ text: 'Old but English', source_hash: 'ffffffffffffffff' }); // kept, still stale
    expect(Object.keys(out.strings)).toEqual(['b1.data.title']);
    expect(out.coverage).toBe(0);
  });

  it('the hash a unit is stamped with is the unit\'s own, never the model\'s text', () => {
    const plan = planOverlayWrite(units, null);
    const n = numberForTranslation(plan.translate);
    const out = assembleOverlay(plan, n, new Map([[0, 'Services'], [1, 'X'], [2, 'Y'], [3, 'A'], [4, 'B']]));
    expect(out.strings['page.title'].source_hash).toBe(unitHash('Tjänster'));
    expect(out.strings['page.title'].source_hash).not.toBe(unitHash('Services'));
  });
});
