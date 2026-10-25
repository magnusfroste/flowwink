/**
 * Links inside blocks follow the page's language. nordbrygg 2026-10-25: the
 * Swedish pages' hero buttons, CTAs, cards and rich-text links all led to the
 * English pages; 34 had to be rewritten by hand. The menu and footer already
 * localised; the blocks now do too, in one place.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildSiblingOf, localizeHref } from '@/hooks/usePageSiblings';
import { localizeBlockLinks } from '@/lib/localize-block-links';

const rows = [
  { slug: 'products', title: 'Products', locale: 'en', translation_group_id: 'g1' },
  { slug: 'products-sv', title: 'Sortiment', locale: 'sv', translation_group_id: 'g1' },
  { slug: 'contact', title: 'Contact', locale: 'en', translation_group_id: 'g2' },
  { slug: 'contact-sv', title: 'Kontakt', locale: 'sv', translation_group_id: 'g2' },
  { slug: 'home', title: 'Home', locale: 'en', translation_group_id: 'g0' },
  { slug: 'home-sv', title: 'Hem', locale: 'sv', translation_group_id: 'g0' },
];
const sv = buildSiblingOf(rows, 'sv', 'en', 'home');
const en = buildSiblingOf(rows, 'en', 'en', 'home');

describe('the sibling lookup', () => {
  it('a row already in the visitor language still answers with its address (no raw -sv slug)', () => {
    expect(sv('products-sv')).toEqual({ slug: 'products-sv', title: 'Sortiment', path: '/sv/products' });
  });
  it('the default-language row in the default language is still nothing to swap', () => {
    expect(en('products')).toBeNull();
    expect(en('home')).toBeNull();
  });
  it('the homepage in another language is the bare prefix', () => {
    expect(sv('home')?.path).toBe('/sv');
    expect(localizeHref('/', sv, 'home')).toBe('/sv');
    expect(localizeHref('/', en, 'home')).toBe('/');
  });
});

describe('localizeBlockLinks', () => {
  const blocks = [
    { id: 'h', type: 'hero', data: { primaryButton: { url: '/products', text: 'Se sortimentet' }, secondaryButton: { url: '/contact#form', text: 'Kontakt' } } },
    { id: 'c', type: 'cta', data: { buttonUrl: '/contact', secondaryButtonUrl: 'https://example.com/x', imageUrl: '/images/a.jpg' } },
    { id: 'f', type: 'features', data: { features: [{ id: 'a', url: '/products' }, { id: 'b', url: '/blog' }] } },
    { id: 't', type: 'text', data: { content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'här', marks: [{ type: 'link', attrs: { href: '/contact' } }] }] }] } } },
  ];

  it('on a Swedish page every page link moves to the Swedish address, hash kept', () => {
    const out = localizeBlockLinks(blocks, sv, 'home') as typeof blocks;
    expect(out[0].data.primaryButton!.url).toBe('/sv/products');
    expect(out[0].data.secondaryButton!.url).toBe('/sv/contact#form');
    expect((out[1].data as Record<string, string>).buttonUrl).toBe('/sv/contact');
    expect((out[2].data as { features: Array<{ url: string }> }).features[0].url).toBe('/sv/products');
    expect(JSON.stringify(out[3])).toContain('"href":"/sv/contact"');
  });

  it('external links, assets and routes that are not pages stay as they are', () => {
    const out = localizeBlockLinks(blocks, sv, 'home') as typeof blocks;
    expect((out[1].data as Record<string, string>).secondaryButtonUrl).toBe('https://example.com/x');
    expect((out[1].data as Record<string, string>).imageUrl).toBe('/images/a.jpg');
    expect((out[2].data as { features: Array<{ url: string }> }).features[1].url).toBe('/blog');
  });

  it('on the default-language page nothing changes and the input is returned as is', () => {
    expect(localizeBlockLinks(blocks, en, 'home')).toBe(blocks);
  });

  it('text that merely looks like a path under a non-link key is never touched', () => {
    const b = [{ id: 'x', type: 'text', data: { title: '/products', caption: '/contact' } }];
    expect(localizeBlockLinks(b, sv, 'home')).toBe(b);
  });
});

describe('the public page applies it once, above its early returns', () => {
  it('PublicPage localizes the served content with the page language and homepage', () => {
    const src = readFileSync(join(process.cwd(), 'src/pages/PublicPage.tsx'), 'utf8');
    expect(src).toMatch(/usePageSiblings\(declaredLang, homepageSlug\)/);
    expect(src).toMatch(/localizeBlockLinks\(served\.content_json, blockLinkSibling, homepageSlug\)/);
    const hookAt = src.indexOf('usePageSiblings(declaredLang');
    const firstReturn = src.indexOf('if (isLoading || authLoading)');
    expect(hookAt).toBeGreaterThan(-1);
    expect(hookAt).toBeLessThan(firstReturn);
  });
});
