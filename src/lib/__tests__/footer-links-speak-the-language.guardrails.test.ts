/**
 * Footer legal links carry their own translations and follow the visitor's
 * language. synclair, 2026-10-23: five links written in Swedish while the site
 * was Swedish printed Swedish under every English page once English became
 * the default — a label with one value cannot be right in two languages.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { localizedLabel } from '@/lib/operator-text';
import { buildSiblingOf, localizeHref } from '@/hooks/usePageSiblings';

describe('localizedLabel: the overlay answers first, then the single-value rule', () => {
  const labels = { sv: 'Integritetspolicy' };

  it('the visitor language reads its own entry, exact tag or same language', () => {
    expect(localizedLabel('Privacy policy', labels, 'Privacy Policy', 'sv', 'en', null)).toBe('Integritetspolicy');
    expect(localizedLabel('Privacy policy', labels, 'Privacy Policy', 'sv-SE', 'en', null)).toBe('Integritetspolicy');
  });

  it("the site's own language reads the operator's label", () => {
    expect(localizedLabel('Privacy policy', labels, 'Privacy Policy', 'en', 'en', null)).toBe('Privacy policy');
  });

  it('no entry for the visitor language falls back to the existing rule (the pack)', () => {
    expect(localizedLabel('Privacy policy', labels, 'Datenschutz', 'de', 'en', null)).toBe('Datenschutz');
    expect(localizedLabel('Privacy policy', undefined, 'Integritetspolicy', 'sv', 'en', null)).toBe('Integritetspolicy');
  });

  it('a blank overlay entry is not an answer', () => {
    expect(localizedLabel('Privacy policy', { sv: '  ' }, 'Integritetspolicy (pack)', 'sv', 'en', null)).toBe('Integritetspolicy (pack)');
  });
});

describe('localizeHref: internal links go to the visitor-language page', () => {
  const rows = [
    { slug: 'portal-login', title: 'Portal login', locale: 'en', translation_group_id: 'g' },
    { slug: 'portal-login-sv', title: 'Portalinloggning', locale: 'sv', translation_group_id: 'g' },
  ];
  const sv = buildSiblingOf(rows, 'sv', 'en');

  it('an internal link is pointed at the sibling, hash kept', () => {
    expect(localizeHref('/portal-login', sv)).toBe('/sv/portal-login');
    expect(localizeHref('/portal-login#faq', sv)).toBe('/sv/portal-login#faq');
  });

  it('external links and pages without a sibling are left alone', () => {
    expect(localizeHref('https://www.synclairvision.com/', sv)).toBe('https://www.synclairvision.com/');
    expect(localizeHref('/contact', sv)).toBe('/contact');
  });
});

describe('the footer and the header use the shared pieces', () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

  it('the footer legal row reads labels and localizes its urls', () => {
    const src = read('src/components/public/PublicFooter.tsx');
    expect(src).toMatch(/localizedLabel\(link\.label, link\.labels,/);
    expect(src).toMatch(/to=\{localizeHref\(link\.url, siblingOf\)\}/);
  });

  it('the header has no private copy of the href localizer', () => {
    const src = read('src/components/public/PublicNavigation.tsx');
    expect(src).toMatch(/localizeHref\(url, siblingOf\)/);
    expect(src).not.toMatch(/const \[path, hash\] = url\.split\('#'\)/);
  });

  it('the manage_global_blocks instructions teach the labels overlay', () => {
    const src = read('src/lib/modules/pages-module.ts');
    expect(src).toMatch(/### Footer legal links/);
    expect(src).toMatch(/labels: \{ sv: "Integritetspolicy" \}/);
  });
});
