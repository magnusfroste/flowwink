/**
 * The footer's quick links follow the visitor's language through the SAME
 * rail as the header menu (usePageSiblings). Observed on synclair the day it
 * became bilingual (2026-10-23): fourteen quick links under an English page,
 * half of them Swedish, each linking to a raw slug — the header, which
 * localised through siblingOf, was right; the footer listed `pages` raw.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildSiblingOf, localizeMenuPages } from '@/hooks/usePageSiblings';

const rows = [
  { slug: 'team', title: 'Company', locale: 'en', translation_group_id: 'g1' },
  { slug: 'team-sv', title: 'Företag', locale: 'sv', translation_group_id: 'g1' },
  { slug: 'home', title: 'Home', locale: 'en', translation_group_id: 'g0' },
  { slug: 'home-sv', title: 'Hem', locale: 'sv', translation_group_id: 'g0' },
  { slug: 'careers', title: 'Careers', locale: 'en', translation_group_id: null },
];

describe('one rail: the visitor-language sibling of a page', () => {
  it('a Swedish visitor gets the Swedish sibling at the prefixed address', () => {
    const siblingOf = buildSiblingOf(rows, 'sv', 'en');
    expect(siblingOf('team')).toEqual({ slug: 'team-sv', title: 'Företag', path: '/sv/team' });
  });

  it('an English visitor on the English row gets nothing to swap', () => {
    const siblingOf = buildSiblingOf(rows, 'en', 'en');
    expect(siblingOf('team')).toBeNull();
    expect(siblingOf('careers')).toBeNull();
  });

  it('no locale, or no grouped rows → never swaps', () => {
    expect(buildSiblingOf(rows, null, 'en')('team')).toBeNull();
    expect(buildSiblingOf([], 'sv', 'en')('team')).toBeNull();
  });
});

describe('a translation group is ONE menu entry', () => {
  const menu = [
    { id: '1', slug: 'team', title: 'Company' },
    { id: '2', slug: 'team-sv', title: 'Företag' },
    { id: '3', slug: 'careers', title: 'Careers' },
  ];

  it('both rows of a group flagged show_in_menu collapse to one, in the visitor language', () => {
    const out = localizeMenuPages(menu, buildSiblingOf(rows, 'sv', 'en'));
    expect(out.map((p) => [p.title, p.path])).toEqual([
      ['Företag', '/sv/team'],
      ['Careers', '/careers'],
    ]);
  });

  it('the default-language visitor sees the default rows at the root form', () => {
    const out = localizeMenuPages(menu, buildSiblingOf(rows, 'en', 'en'));
    expect(out.map((p) => [p.title, p.path])).toEqual([
      ['Company', '/team'],
      ['Careers', '/careers'],
    ]);
  });
});

describe('both consumers are on the rail', () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

  it('the footer lists localized pages by their path, never raw slugs', () => {
    const src = read('src/components/public/PublicFooter.tsx');
    expect(src).toMatch(/usePageSiblings\(lang\)/);
    expect(src).toMatch(/localizeMenuPages\(pages, siblingOf\)/);
    expect(src).toMatch(/quickLinkPages\.slice\(0, 6\)/);
    expect(src).not.toMatch(/page\.slug === 'hem' \? '\/' : `\/\$\{page\.slug\}`/);
  });

  it('the header menu uses the same hook, with no private copy of the lookup', () => {
    const src = read('src/components/public/PublicNavigation.tsx');
    expect(src).toMatch(/usePageSiblings\(currentLocale\)/);
    expect(src).toMatch(/localizeMenuPages\(sourcePages, siblingOf\)/);
    expect(src).not.toMatch(/queryKey: \['public-nav-translations'\]/);
  });
});
