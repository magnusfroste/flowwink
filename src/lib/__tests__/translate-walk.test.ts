import { describe, it, expect } from 'vitest';
import {
  collectTranslatable, applyTranslations, batchStrings, isTranslatable, structureSignature,
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
