import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  collectTranslatable, applyTranslations, batchStrings, isTranslatable, isReadoutProse, structureSignature, TEXT_KEY_SUFFIX,
} from '../../../supabase/functions/_shared/i18n/translate-walk';

const page = {
  title: 'For Agencies',
  meta_json: { seoTitle: 'FlowWink for agencies', description: 'Run every client on one system.', ogImage: 'https://x/og.png' },
  content_json: [
    {
      id: 'b1', type: 'hero', variant: 'split', backgroundImage: 'https://x/hero.jpg',
      data: { title: 'One system for every client', subtitle: 'CMS, CRM and ERP in one place', buttonText: 'Book a demo', buttonUrl: '/contact', icon: 'lucide-arrow-right', align: 'center' },
    },
    {
      id: 'b2', type: 'rich-text',
      data: { content: { type: 'doc', content: [{ type: 'paragraph', content: [
        { type: 'text', text: 'Read the ' },
        { type: 'text', text: 'docs', marks: [{ type: 'link', attrs: { href: 'https://docs.flowwink.com' } }] },
      ] }] } },
    },
    { id: 'b3', type: 'testimonials', data: { items: [{ quote: 'It just works.', author: 'Anna Berg', company: 'Resta Gård', role: 'Owner' }] } },
    { id: 'b4', type: 'table', data: { rows: [{ col1: 'Feature', col2: 'Included' }, { col1: 'Yes', col2: 'No' }] } },
  ],
};

describe('The translatable surface of a page — found, not enumerated', () => {
  it('collects prose and leaves ids, urls, icons, variants, names and link hrefs alone', () => {
    const found = collectTranslatable(page);
    const texts = found.map((f) => f.text);
    expect(texts).toContain('For Agencies');
    expect(texts).toContain('FlowWink for agencies');
    expect(texts).toContain('One system for every client');
    expect(texts).toContain('Book a demo');
    expect(texts).toContain('Read the ');
    expect(texts).toContain('docs'); // a Tiptap text node is prose even when short
    expect(texts).toContain('It just works.');
    expect(texts).toContain('Owner');
    expect(texts).toContain('Feature');
    expect(texts).toContain('Yes');
    for (const bad of ['b1', 'hero', 'split', 'https://x/hero.jpg', '/contact', 'lucide-arrow-right', 'center', 'https://docs.flowwink.com', 'Anna Berg', 'Resta Gård', 'https://x/og.png']) {
      expect(texts).not.toContain(bad);
    }
  });

  it('isTranslatable: key wins, then shape', () => {
    expect(isTranslatable('title', 'Hem')).toBe(true);
    expect(isTranslatable('url', 'Hem')).toBe(false);
    expect(isTranslatable('foo', 'primary')).toBe(false);
    expect(isTranslatable('foo', 'A sentence with spaces')).toBe(true);
    expect(isTranslatable('foo', '#ff00aa')).toBe(false);
    expect(isTranslatable('foo', '12345')).toBe(false);
    expect(isTranslatable('title', 42)).toBe(false);
  });

  it('applyTranslations writes back into an identical tree — structure is preserved by construction', () => {
    const found = collectTranslatable(page);
    const swedish = found.map((f) => ({ path: f.path, text: `SV:${f.text}` }));
    const out = applyTranslations(page, swedish) as typeof page;
    const at = (root: unknown, path: (string | number)[]): unknown =>
      path.reduce<unknown>((node, key) => (node && typeof node === 'object' ? (node as Record<string | number, unknown>)[key] : undefined), root);
    expect(structureSignature(out.content_json)).toBe(structureSignature(page.content_json));
    expect(out.content_json.length).toBe(4);
    expect(out.title).toBe('SV:For Agencies');
    expect(at(out, ['content_json', 0, 'data', 'title'])).toBe('SV:One system for every client');
    expect(at(out, ['content_json', 0, 'data', 'buttonUrl'])).toBe('/contact');
    expect(at(out, ['content_json', 1, 'data', 'content', 'content', 0, 'content', 1, 'marks', 0, 'attrs', 'href'])).toBe('https://docs.flowwink.com');
    expect(at(out, ['content_json', 2, 'data', 'items', 0, 'author'])).toBe('Anna Berg');
    // the original is untouched
    expect(page.title).toBe('For Agencies');
  });

  it('batches are bounded by count and by size', () => {
    const many = Array.from({ length: 95 }, (_, i) => ({ i, text: 'x'.repeat(200) }));
    const b = batchStrings(many, 40, 6000);
    expect(b.length).toBeGreaterThanOrEqual(3);
    expect(Math.max(...b.map((x) => x.length))).toBeLessThanOrEqual(40);
    expect(Math.max(...b.map((x) => x.reduce((n, it) => n + it.text.length, 0)))).toBeLessThanOrEqual(6000);
    expect(b.flat().length).toBe(95);
  });
});

describe('chips, chip labels and word readouts are prose (synclair 2026-10-23)', () => {
  it('string items of an array are judged by the array key', () => {
    const hero = { tags: ['01 ISR & objektskydd', 'Interceptor'], tagsLabel: 'Användningsområden', tagGroups: [{ label: 'Flöde', tags: ['Fånga', 'Bearbeta'] }] };
    const got = collectTranslatable(hero).map((t) => t.path.join('.') + '=' + t.text);
    expect(got).toContain('tags.0=01 ISR & objektskydd');
    expect(got).toContain('tags.1=Interceptor');
    expect(got).toContain('tagsLabel=Användningsområden');
    expect(got).toContain('tagGroups.0.tags.0=Fånga');
    expect(got).toContain('tagGroups.0.tags.1=Bearbeta');
  });

  it('form options and pricing features are offered; icon and id arrays are not', () => {
    const got = collectTranslatable({
      fields: [{ options: ['Ja', 'Nej', 'Vet ej'] }],
      tiers: [{ features: ['Obegränsade sidor', 'Support dygnet runt'] }],
      icons: ['lucide-check', 'lucide-x'],
      ids: ['a1', 'b2'],
    }).map((t) => t.text);
    expect(got).toEqual(['Ja', 'Nej', 'Vet ej', 'Obegränsade sidor', 'Support dygnet runt']);
  });

  it('a value is data unless it is words: readouts translate, measurements stay', () => {
    expect(isTranslatable('value', 'Luft · Mark · Sjö')).toBe(true);
    expect(isTranslatable('value', 'Air, land and sea')).toBe(true);
    expect(isTranslatable('value', '12 MP')).toBe(false);
    expect(isTranslatable('value', 'IP67')).toBe(false);
    expect(isTranslatable('value', '0,4 kg')).toBe(false);
    expect(isTranslatable('value', 'Ja')).toBe(false);
    expect(isReadoutProse('412 km')).toBe(false);
  });

  it('applyTranslations writes an array item back in place', () => {
    const root = { tags: ['Fånga', 'Bearbeta'] };
    const found = collectTranslatable(root);
    const out = applyTranslations(root, found.map((t, i) => ({ path: t.path, text: ['Capture', 'Process'][i] }))) as { tags: string[] };
    expect(out.tags).toEqual(['Capture', 'Process']);
    expect(structureSignature(out)).toBe(structureSignature(root));
  });
});

describe('a key named as text is prose even when its value is one word (optic 2026-10-25)', () => {
  it.each([
    ['submitButtonText', 'Send'], ['secondaryButtonText', 'Book'], ['searchPlaceholder', 'Search'],
    ['emptyMessage', 'Empty'], ['liveText', 'Live'], ['imageLabel', 'MOSS'], ['contactTitle', 'Contact'],
  ])('%s = %s', (key, value) => {
    expect(isTranslatable(key, value)).toBe(true);
  });

  it('keys that only contain the word stay data', () => {
    expect(isTranslatable('textColor', 'muted')).toBe(false);
    expect(isTranslatable('titleSize', 'large')).toBe(false);
    expect(isTranslatable('labelPosition', 'top')).toBe(false);
  });

  it('every string field the block catalogue names as text is reached (discovered from the catalogue)', () => {
    const ref = readFileSync(join(process.cwd(), 'src/lib/block-reference.ts'), 'utf8');
    const names = [...ref.matchAll(/name: '([a-zA-Z]+)', type: 'string'/g)].map((m) => m[1]);
    const textNamed = [...new Set(names)].filter((n) => TEXT_KEY_SUFFIX.test(n.toLowerCase()));
    expect(textNamed.length).toBeGreaterThan(20);
    const missed = textNamed.filter((n) => !isTranslatable(n, 'Word'));
    expect(missed).toEqual([]);
  });
});
