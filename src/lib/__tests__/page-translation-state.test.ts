import { describe, it, expect } from 'vitest';
import { versionState, languageCoverage, pagesToTranslate } from '@/lib/page-translation-state';

const pages = [
  { id: 'p1', slug: 'home', status: 'published', locale: 'sv', translation_group_id: null },
  { id: 'p2', slug: 'tjanster', status: 'published', locale: 'sv', translation_group_id: null },
  { id: 'p3', slug: 'om', status: 'published', locale: 'sv', translation_group_id: null },
  { id: 'p4', slug: 'utkast', status: 'draft', locale: 'sv', translation_group_id: null },
  // legacy group: sv row + en sibling row
  { id: 'p5', slug: 'kontakt', status: 'published', locale: 'sv', translation_group_id: 'g1' },
  { id: 'p6', slug: 'kontakt-en', status: 'published', locale: 'en', translation_group_id: 'g1' },
];
const overlays = [
  { page_id: 'p1', locale: 'en', status: 'published', coverage: 100 },
  { page_id: 'p2', locale: 'en', status: 'draft', coverage: 60 },
  { page_id: 'p1', locale: 'de', status: 'published', coverage: 90 },
];

describe('versionState — one chip, whichever model holds the version', () => {
  it('overlay published / draft / missing', () => {
    expect(versionState(pages[0], 'en', overlays, pages)).toEqual({ state: 'published', coverage: 100, source: 'overlay' });
    expect(versionState(pages[1], 'en', overlays, pages)).toEqual({ state: 'draft', coverage: 60, source: 'overlay' });
    expect(versionState(pages[2], 'en', overlays, pages)).toEqual({ state: 'missing' });
  });
  it('a legacy sibling row counts as a published version', () => {
    expect(versionState(pages[4], 'en', overlays, pages)).toEqual({ state: 'published', coverage: null, source: 'row' });
    expect(versionState(pages[4], 'de', overlays, pages)).toEqual({ state: 'missing' });
  });
  it('locale comparison is case-insensitive', () => {
    expect(versionState(pages[0], 'EN', overlays, pages).state).toBe('published');
  });
});

describe('languageCoverage — the Languages card number', () => {
  it('counts published source pages only, per other language', () => {
    const c = languageCoverage(pages, overlays, 'sv', ['sv', 'en', 'de']);
    expect(c).toEqual([
      { locale: 'en', pages: 4, published: 2, draft: 1, missing: 1 }, // home (overlay), kontakt (row); tjanster draft; om missing
      { locale: 'de', pages: 4, published: 1, draft: 0, missing: 3 },
    ]);
  });
  it('the site language itself is never a row', () => {
    expect(languageCoverage(pages, overlays, 'sv', ['sv'])).toEqual([]);
  });
});

describe('pagesToTranslate — the todo "translate what is missing" walks', () => {
  it('lists published source pages without a published version, drafts included', () => {
    expect(pagesToTranslate(pages, overlays, 'sv', 'en').map((p) => p.slug)).toEqual(['tjanster', 'om']);
    expect(pagesToTranslate(pages, overlays, 'sv', 'de').map((p) => p.slug)).toEqual(['tjanster', 'om', 'kontakt']);
  });
});
