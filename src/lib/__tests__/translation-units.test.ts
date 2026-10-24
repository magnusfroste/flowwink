import { describe, it, expect } from 'vitest';
import {
  collectUnits, unitHash, docText, diffOverlay, overlayReplacements, applyOverlay, formatUnitPath, isTiptapDoc,
  type OverlayEntry,
} from '../../../supabase/functions/_shared/i18n/translation-units';
import { structureSignature } from '../../../supabase/functions/_shared/i18n/translate-walk';

// The fixture from translate-walk.test.ts, with the block ids an editor gives.
const richText = { type: 'doc', content: [{ type: 'paragraph', content: [
  { type: 'text', text: 'Read the ' },
  { type: 'text', text: 'docs', marks: [{ type: 'link', attrs: { href: 'https://docs.flowwink.com' } }] },
] }] };

const page = {
  title: 'For Agencies',
  meta_json: { seoTitle: 'FlowWink for agencies', description: 'Run every client on one system.', ogImage: 'https://x/og.png' },
  content_json: [
    { id: 'b1', type: 'hero', data: { title: 'One system for every client', subtitle: 'CMS, CRM and ERP in one place', buttonText: 'Book a demo', buttonUrl: '/contact', tags: ['Agencies', 'Studios'] } },
    { id: 'b2', type: 'rich-text', data: { content: richText } },
    { id: 'b3', type: 'testimonials', data: { items: [{ quote: 'It just works.', author: 'Anna Berg', role: 'Owner' }] } },
  ],
};

const keys = (p: typeof page) => collectUnits(p).map((u) => u.unit);

describe('Translation units — a key that survives editing (page-translations.md §2.2)', () => {
  it('keys a block\'s text by the block id and the path inside it; the page\'s own fields under page.*', () => {
    const got = keys(page);
    expect(got).toEqual([
      'page.title',
      'page.meta.seoTitle', 'page.meta.description',
      'b1.data.title', 'b1.data.subtitle', 'b1.data.buttonText', 'b1.data.tags[0]', 'b1.data.tags[1]',
      'b2.data.content',
      'b3.data.items[0].quote', 'b3.data.items[0].role',
    ]);
  });

  it('inserting a block above changes no key and no hash — the index-based path does', () => {
    const before = collectUnits(page);
    const moved = { ...page, content_json: [{ id: 'b0', type: 'text', data: { text: 'A new intro paragraph.' } }, ...page.content_json] };
    const after = collectUnits(moved);
    const byUnit = new Map(after.map((u) => [u.unit, u]));
    for (const u of before) {
      expect(byUnit.get(u.unit)?.hash).toBe(u.hash);
      if (u.unit.startsWith('b')) expect(byUnit.get(u.unit)?.path).not.toEqual(u.path);
    }
    expect(byUnit.has('b0.data.text')).toBe(true);
  });

  it('a Tiptap document is one unit, hashed on its text — a moved mark does not stale it, a changed word does', () => {
    const [doc] = collectUnits(page).filter((u) => u.kind === 'doc');
    expect(doc.unit).toBe('b2.data.content');
    expect(doc.text).toBe('Read the \u001fdocs');
    expect(isTiptapDoc(doc.doc)).toBe(true);

    const markMoved = JSON.parse(JSON.stringify(richText));
    markMoved.content[0].content[0].marks = [{ type: 'bold' }];
    markMoved.content[0].content[1].marks = undefined;
    markMoved.content[0].attrs = { textAlign: 'left', id: 'p-9f2' };
    expect(unitHash(docText(markMoved))).toBe(doc.hash);

    const wordChanged = JSON.parse(JSON.stringify(richText));
    wordChanged.content[0].content[0].text = 'Read our ';
    expect(unitHash(docText(wordChanged))).not.toBe(doc.hash);
  });

  it('the hash is deterministic, 16 hex chars, and differs on a one-character change', () => {
    expect(unitHash('Book a demo')).toBe(unitHash('Book a demo'));
    expect(unitHash('Book a demo')).toMatch(/^[0-9a-f]{16}$/);
    expect(unitHash('Book a demo')).not.toBe(unitHash('Book a demo.'));
    expect(unitHash('')).toMatch(/^[0-9a-f]{16}$/);
  });

  it('a block without an id is keyed by position so nothing is dropped, and the key says so', () => {
    const legacy = { content_json: [{ type: 'text', data: { text: 'Old block, no id yet.' } }] };
    expect(collectUnits(legacy).map((u) => u.unit)).toEqual(['#0.data.text']);
  });

  it('formatUnitPath: dots for keys, brackets for indices', () => {
    expect(formatUnitPath(['data', 'items', 0, 'quote'])).toBe('data.items[0].quote');
    expect(formatUnitPath(['tags', 1])).toBe('tags[1]');
  });
});

describe('The overlay — missing, stale, fresh, orphan (page-translations.md §2.2, §2.3)', () => {
  const units = collectUnits(page);
  const entry = (unit: string, text: string): [string, OverlayEntry] => {
    const u = units.find((x) => x.unit === unit)!;
    return [unit, { text, source_hash: u.hash }];
  };
  const overlay: Record<string, OverlayEntry> = Object.fromEntries([
    entry('page.title', 'För byråer'),
    entry('b1.data.title', 'Ett system för varje kund'),
    entry('b1.data.buttonText', 'Boka en demo'),
    ['b3.data.items[0].quote', { text: 'Det bara fungerar.', source_hash: 'deadbeefdeadbeef' }], // source changed since
    ['b9.data.title', { text: 'Ett block som togs bort', source_hash: '0000000000000000' }],   // orphan
  ]);

  it('diffOverlay sorts every unit into exactly one bucket and names the orphans', () => {
    const d = diffOverlay(units, overlay);
    expect(d.fresh.map((u) => u.unit)).toEqual(['page.title', 'b1.data.title', 'b1.data.buttonText']);
    expect(d.stale.map((u) => u.unit)).toEqual(['b3.data.items[0].quote']);
    expect(d.missing.map((u) => u.unit)).toEqual([
      'page.meta.seoTitle', 'page.meta.description', 'b1.data.subtitle', 'b1.data.tags[0]', 'b1.data.tags[1]', 'b2.data.content', 'b3.data.items[0].role',
    ]);
    expect(d.orphans).toEqual(['b9.data.title']);
    expect(d.fresh.length + d.stale.length + d.missing.length).toBe(units.length);
  });

  it('an empty overlay is all missing — adding a language copies nothing', () => {
    const d = diffOverlay(units, null);
    expect(d.missing.length).toBe(units.length);
    expect(d.orphans).toEqual([]);
  });

  it('a hand-polished entry survives until its source changes: same text, new hash → stale, text kept', () => {
    const edited = { ...page, content_json: page.content_json.map((b) => b.id === 'b1' ? { ...b, data: { ...b.data, title: 'One system for every client.' } } : b) };
    const d = diffOverlay(collectUnits(edited), overlay);
    expect(d.stale.map((u) => u.unit)).toContain('b1.data.title');
    // and the resolver still shows the (slightly stale) translation, not the source
    const out = applyOverlay(edited, overlayReplacements(collectUnits(edited), overlay)) as typeof page;
    expect(out.content_json[0].data.title).toBe('Ett system för varje kund');
  });

  it('applyOverlay: text and doc entries land in place, missing units keep the source, structure is identical', () => {
    const svDoc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Läs ' }, { type: 'text', text: 'dokumentationen', marks: [{ type: 'link', attrs: { href: 'https://docs.flowwink.com' } }] }] }] };
    const withDoc: Record<string, OverlayEntry> = { ...overlay, 'b2.data.content': { doc: svDoc, source_hash: units.find((u) => u.unit === 'b2.data.content')!.hash } };
    const out = applyOverlay(page, overlayReplacements(units, withDoc)) as typeof page;
    expect(out.title).toBe('För byråer');
    expect(out.content_json[0].data.title).toBe('Ett system för varje kund');
    expect(out.content_json[0].data.subtitle).toBe('CMS, CRM and ERP in one place'); // missing → source, visible
    expect(out.content_json[0].data.buttonUrl).toBe('/contact');
    expect(out.content_json[1].data.content).toEqual(svDoc);
    expect(out.content_json[2].data.items[0].author).toBe('Anna Berg');
    expect(structureSignature(out.content_json)).toBe(structureSignature(page.content_json));
    expect(page.content_json[1].data.content).toEqual(richText); // the source is untouched
  });

  it('a doc entry that is not a Tiptap document is ignored, never written over the source', () => {
    const bad: Record<string, OverlayEntry> = { 'b2.data.content': { doc: 'not a doc', source_hash: units.find((u) => u.unit === 'b2.data.content')!.hash } };
    const out = applyOverlay(page, overlayReplacements(units, bad)) as typeof page;
    expect(out.content_json[1].data.content).toEqual(richText);
  });
});
