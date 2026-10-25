/**
 * What the admin shows about a page's translations — pure, so the chips in the
 * pages list and the coverage on the Languages card are pinned by a test and
 * agree with each other.
 *
 * A page's languages come from two models until the conversion has run:
 * OVERLAYS (page_translations: one page, text per language) and sibling ROWS
 * (translation_group_id, the pre-overlay model). Both are "a version"; the
 * chip says which state it is in, never which table it came from.
 *
 * Design: docs/architecture/page-translations.md §5.1–5.2.
 */

export interface OverlayHead {
  page_id: string;
  locale: string;
  status: string;
  coverage: number | null;
}

export interface PageHead {
  id: string;
  slug: string;
  status: string;
  locale?: string | null;
  translation_group_id?: string | null;
}

export type VersionState =
  | { state: 'published'; coverage: number | null; source: 'overlay' | 'row' }
  | { state: 'draft'; coverage: number | null; source: 'overlay' | 'row' }
  | { state: 'missing' };

/** The state of page `page` in language `locale`. */
export function versionState(page: PageHead, locale: string, overlays: OverlayHead[], pages: PageHead[]): VersionState {
  const l = locale.toLowerCase();
  const own = (overlays ?? []).find((o) => o.page_id === page.id && o.locale.toLowerCase() === l);
  if (own) {
    return { state: own.status === 'published' ? 'published' : 'draft', coverage: own.coverage, source: 'overlay' };
  }
  if (page.translation_group_id) {
    const sibling = (pages ?? []).find((p) => p.id !== page.id
      && p.translation_group_id === page.translation_group_id
      && String(p.locale ?? '').toLowerCase() === l);
    if (sibling) return { state: sibling.status === 'published' ? 'published' : 'draft', coverage: null, source: 'row' };
  }
  return { state: 'missing' };
}

export interface LanguageCoverage {
  locale: string;
  /** Published source pages. */
  pages: number;
  published: number;
  draft: number;
  missing: number;
}

/**
 * Per language: how many of the site's published source-language pages have a
 * published version, a draft, or nothing. The Languages card's "14 of 16
 * pages published" and the pages-to-translate list come from this.
 */
export function languageCoverage(
  pages: PageHead[],
  overlays: OverlayHead[],
  defaultLanguage: string,
  languages: string[],
): LanguageCoverage[] {
  const def = defaultLanguage.toLowerCase();
  const source = (pages ?? []).filter((p) => p.status === 'published' && String(p.locale ?? def).toLowerCase() === def);
  return languages
    .map((l) => l.toLowerCase())
    .filter((l) => l !== def)
    .map((locale) => {
      let published = 0, draft = 0, missing = 0;
      for (const p of source) {
        const v = versionState(p, locale, overlays, pages);
        if (v.state === 'published') published += 1;
        else if (v.state === 'draft') draft += 1;
        else missing += 1;
      }
      return { locale, pages: source.length, published, draft, missing };
    });
}

/** The source pages that have no published version in `locale` — the todo. */
export function pagesToTranslate(pages: PageHead[], overlays: OverlayHead[], defaultLanguage: string, locale: string): PageHead[] {
  const def = defaultLanguage.toLowerCase();
  return (pages ?? [])
    .filter((p) => p.status === 'published' && String(p.locale ?? def).toLowerCase() === def)
    .filter((p) => versionState(p, locale, overlays, pages).state !== 'published');
}
