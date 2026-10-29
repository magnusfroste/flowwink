/**
 * The content floor (_shared/content-quality.ts): the structural answer to
 * Hermes' audit of autoversio.ai (2026-10-28) — median 260 words, 18 titles on
 * one angle, 8 English posts on a Swedish site, the start page's over-promises
 * in the body, and a featured image chosen by sending the brief to Unsplash.
 */
import { describe, it, expect } from 'vitest';
import {
  assessPost, countWords, countHeadings, detectLanguage, findForbiddenClaims, imageQueryFor, altTextFor,
  postBodyText, countInlineImages, isBrandCovers, readingMinutes, mergePostMeta,
} from '../../../supabase/functions/_shared/content-quality.ts';
import { titleSimilarity } from '../../../supabase/functions/_shared/domains/content-memory.ts';

const sv = `## Varför privat AI\n\nNär ett företag flyttar sin data till en molntjänst som inte är deras egen, flyttar de också kontrollen över vem som kan läsa den och när. Det är inte en teknisk fråga utan en fråga om vem som bestämmer. Vi har sett att många företag inte vet var deras loggar hamnar, och det är där problemen börjar när en upphandling ställer frågan. `.repeat(12);
const en = `## Why private AI\n\nWhen a company moves its data to a cloud service that is not its own, it also moves control over who can read it and when. This is not a technical question but a question of who decides. We have seen that many companies do not know where their logs end up, and that is where the problems begin when a procurement asks. `.repeat(12);

const existing = [
  { title: 'Privat AI i Sverige 2026: Så bygger ni en trust zone', slug: 'privat-ai-trust-zone', status: 'published' },
  { title: 'Fable 5-budet: varför svenska företag inte kan lita på amerikansk AI-cloud', slug: 'fable-5-budet', status: 'published' },
];
const base = { minWords: 600, existing, similarity: titleSimilarity };

describe('content quality — words, headings, language', () => {
  it('counts the words of a markdown body, not its markup', () => {
    expect(countWords('## Rubrik\n\n- en **fet** punkt\n- [länk](https://x) och ![bild](https://y)\n')).toBe(6);
    expect(countHeadings('# H1\n## a\n### b\ntext\n##notaheading')).toBe(2);
  });
  it('tells Swedish from English by function words, and abstains on short or mixed text', () => {
    expect(detectLanguage(sv)?.language).toBe('sv');
    expect(detectLanguage(en)?.language).toBe('en');
    expect(detectLanguage('Hej och välkommen.')).toBeNull();
    expect(detectLanguage(`${sv}\n${en}`)).toBeNull();
  });
});

describe('the floor — the first fault, as a refusal', () => {
  it('refuses an introduction (under the floor) with the floor and what to write', () => {
    const r = assessPost({ ...base, title: 'En ny vinkel', content: sv.slice(0, 900), language: 'sv' });
    expect(r?.code).toBe('CONTENT_TOO_THIN');
    expect(r?.status).toBe('refused');
    expect(r?.retryable).toBe(false);
    expect(r?.hint).toMatch(/1200 words/);
    expect(r).not.toHaveProperty('error');
  });
  it('refuses a body in another language than the post is declared in', () => {
    const r = assessPost({ ...base, title: 'A brand new angle on logging', content: en, language: 'sv' });
    expect(r?.code).toBe('LANGUAGE_MISMATCH');
    expect(r).toMatchObject({ detected: 'en', declared: 'sv' });
  });
  it('lets a body through when no language is declared, or when it matches', () => {
    expect(assessPost({ ...base, title: 'A brand new angle on logging', content: en, language: null })).toBeNull();
    expect(assessPost({ ...base, title: 'En helt ny vinkel på loggning', content: sv, language: 'sv' })).toBeNull();
  });
  it('refuses a re-word of an earlier title and names the post to extend instead', () => {
    const r = assessPost({ ...base, title: 'Privat AI i Sverige 2026 — trust zone, så bygger ni den', content: sv, language: 'sv' });
    expect(r?.code).toBe('DUPLICATE_CONTENT');
    expect(r?.hint).toContain('privat-ai-trust-zone');
    expect((r as unknown as { duplicates: Array<{ slug: string }> }).duplicates[0].slug).toBe('privat-ai-trust-zone');
  });
  it('refuses a ruled-out claim, case- and diacritic-insensitively, and names it', () => {
    const r = assessPost({ ...base, title: 'En helt ny vinkel på loggning', content: `${sv}\n\nVi GARANTERAR säkerhet och 100 % datakontroll.`, language: 'sv', claimsToAvoid: ['garanterar säkerhet', '100 % datakontroll'] });
    expect(r?.code).toBe('FORBIDDEN_CLAIM');
    expect((r as unknown as { claims: string[] }).claims).toEqual(['garanterar säkerhet', '100 % datakontroll']);
    expect(findForbiddenClaims('ingen garanti här', ['garanterar säkerhet'])).toEqual([]);
    expect(findForbiddenClaims('x', 'not a list')).toEqual([]);
  });
  it('a floor of 0 turns the word check off', () => {
    expect(assessPost({ ...base, minWords: 0, title: 'En helt ny vinkel på loggning', content: 'Kort.', language: null })).toBeNull();
  });
});

describe('the picture — never the brief', () => {
  it('asks for the title\'s nouns with the industry as anchor, two to four words', () => {
    expect(imageQueryFor('Säkra AI-system i Trust Zone: så gör ni', 'IT-infrastruktur')).toBe('sakra system trust infrastruktur');
    expect(imageQueryFor('The latest news about private AI in 2026')).toBe('private');
    expect(imageQueryFor('Draft the original blog post covering the unique angle on private AI').split(' ').length).toBeLessThanOrEqual(4);
  });
  it('the alt is the article, not the photo', () => {
    expect(altTextFor('  Säkra AI-system i Trust Zone ')).toBe('Säkra AI-system i Trust Zone');
  });
});

describe('a stored body in either shape (audit_blog reads what is stored)', () => {
  const p = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
  const doc = (...content: unknown[]) => ({ type: 'doc', content });
  // What src/data/template-blog-posts.ts seeds: a block array, a doc inside each block.
  const blocks = [
    { id: 'text-0001', type: 'text', data: { content: doc(p('Every successful product started as an idea.'), { type: 'image', attrs: { src: 'https://x/y.png' } }) } },
    { id: 'text-0002', type: 'text', data: { content: doc({ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Validate first' }] }, p('Talk to twenty customers.')) } },
  ];

  it('a block array is read, not counted as 0 words', () => {
    const text = postBodyText(blocks);
    expect(text).toBe('Every successful product started as an idea. Validate first Talk to twenty customers.');
    expect(text.split(/\s+/).filter(Boolean)).toHaveLength(13);
  });
  it('a Tiptap doc reads as before', () => {
    expect(postBodyText(doc(p('Ett två tre.'), p('Fyra.')))).toBe('Ett två tre. Fyra.');
    expect(postBodyText(null)).toBe('');
    expect(postBodyText('<p>html <b>body</b></p>')).toBe('html body');
  });
  it('a block-array body no longer hides a ruled-out claim or its language', () => {
    const sv = 'Vi garanterar säkerhet. När ett företag flyttar sin data till en molntjänst som inte är deras egen, flyttar de också kontrollen över vem som kan läsa den och när det sker. '.repeat(6);
    const seeded = [{ id: 'b1', type: 'text', data: { content: doc(p(sv)) } }];
    expect(findForbiddenClaims(postBodyText(seeded), ['garanterar säkerhet'])).toEqual(['garanterar säkerhet']);
    expect(detectLanguage(postBodyText(seeded))?.language).toBe('sv');
  });
  it('counts inline images at any depth in either shape', () => {
    expect(countInlineImages(blocks)).toBe(1);
    expect(countInlineImages(doc(p('a'), { type: 'image', attrs: {} }, { type: 'image', attrs: {} }))).toBe(2);
    expect(countInlineImages(null)).toBe(0);
  });
  it('brand covers is the dial value "brand" and nothing else', () => {
    expect(isBrandCovers({ coverStyle: 'brand' })).toBe(true);
    expect(isBrandCovers({ coverStyle: 'photo' })).toBe(false);
    expect(isBrandCovers({})).toBe(false);
    expect(isBrandCovers(null)).toBe(false);
  });
});

describe('a rewritten post keeps its reading time and its meta honest', () => {
  const doc = (words: number) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: Array.from({ length: words }, (_, i) => `ord${i}`).join(' ') }] }] });
  it('reading time is the editor\'s rule: words / 200, rounded up, at least 1 — in either stored shape', () => {
    expect(readingMinutes(doc(900))).toBe(5);
    expect(readingMinutes(doc(200))).toBe(1);
    expect(readingMinutes(doc(201))).toBe(2);
    expect(readingMinutes(null)).toBe(1);
    expect(readingMinutes([{ id: 'b', type: 'text', data: { content: doc(450) } }])).toBe(3);
  });
  it('meta is merged, not replaced; null or "" removes a key; strings are trimmed', () => {
    const cur = { seoTitle: 'Old', description: 'Old desc', keywords: ['a'], canonicalUrl: 'https://x' };
    expect(mergePostMeta(cur, { seoTitle: '  New  ', description: null })).toEqual({ seoTitle: 'New', keywords: ['a'], canonicalUrl: 'https://x' });
    expect(mergePostMeta(cur, { ogImage: '' })).toEqual(cur);
    expect(mergePostMeta(null, { description: 'D' })).toEqual({ description: 'D' });
    expect(mergePostMeta(['not', 'an', 'object'], { description: 'D' })).toEqual({ description: 'D' });
    expect(cur.seoTitle).toBe('Old'); // the input is not mutated
  });
});
