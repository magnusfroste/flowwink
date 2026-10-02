import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { navigationGroups } from '@/components/admin/adminNavigation';

/**
 * One fact, one owner — between Branding and the header block.
 *
 * branding.showNameWithLogo and header.showNameWithLogo both existed, and the
 * public header OR-ed them: an admin turned Branding's off and the name stayed
 * (Hermes, 2026-10-02). Branding also carried showLogoInHeader and
 * headerLogoSize, which nothing but its own preview read. The roles decide the
 * owner — identity (the name) is Branding's, layout (logo, size) is the header
 * block's — and this guard keeps the two vocabularies disjoint by SHAPE: any
 * field name present in both interfaces fails, whatever it is called.
 *
 * It also pins the navigation ruling: the content page is "Pages" (editor-level,
 * pages module), Branding lives only under Admin, and the Branding tab that
 * mounted the same page without the gate is gone.
 */
const root = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf-8');

function interfaceKeys(src: string, name: string): string[] {
  const m = src.match(new RegExp(`export interface ${name}\\s*\\{([\\s\\S]*?)\\n\\}`));
  if (!m) throw new Error(`interface ${name} not found`);
  return [...m[1].matchAll(/^\s+([a-zA-Z0-9_]+)\??:/gm)].map((x) => x[1]);
}

describe('Branding and the header block share no field', () => {
  const branding = interfaceKeys(read('src/hooks/useSiteSettings.tsx'), 'BrandingSettings');
  const header = interfaceKeys(read('src/types/cms.ts'), 'HeaderBlockData');

  it('the two vocabularies are disjoint', () => {
    expect(branding.length).toBeGreaterThan(5);
    expect(header.length).toBeGreaterThan(5);
    const shared = branding.filter((k) => header.includes(k));
    expect(shared, 'a field in both is a fact with two owners — pick one').toEqual([]);
  });

  it('the public header reads the name-with-logo fact from branding only', () => {
    const nav = read('src/components/public/PublicNavigation.tsx');
    expect(nav).toMatch(/branding\?\.showNameWithLogo === true/);
    expect(nav).not.toMatch(/headerSettings\.showNameWithLogo/);
  });

  it('Branding has no header-layout fields and the header editor has no name switch', () => {
    expect(branding).not.toContain('showLogoInHeader');
    expect(branding).not.toContain('headerLogoSize');
    expect(header).not.toContain('showNameWithLogo');
    expect(read('src/components/admin/blocks/HeaderBlockEditor.tsx')).not.toMatch(/showNameWithLogo/);
  });
});

describe('Pages is editor-level content; Branding is admin-only', () => {
  it('the content page is called Pages and Branding sits only in the admin-only group', () => {
    const groups = navigationGroups as unknown as Array<{ label: string; adminOnly?: boolean; items: Array<{ name: string; href: string }> }>;
    const pages = groups.flatMap((g) => g.items).find((i) => i.href === '/admin/pages');
    expect(pages?.name).toBe('Pages');
    const brandingGroups = groups.filter((g) => g.items.some((i) => i.href === '/admin/branding'));
    expect(brandingGroups.map((g) => g.label)).toEqual(['Admin']);
    expect(brandingGroups[0].adminOnly).toBe(true);
  });

  it('the Pages page has no Branding tab, and the old tab link lands on Branding', () => {
    const src = read('src/pages/admin/PagesListPage.tsx');
    expect(src).not.toMatch(/TabsTrigger value="branding"/);
    expect(src).toMatch(/tabFromUrl === 'branding'[\s\S]{0,120}navigate\('\/admin\/branding'/);
    expect(existsSync(join(root, 'src/components/admin/pages/BrandingTab.tsx'))).toBe(false);
  });
});
