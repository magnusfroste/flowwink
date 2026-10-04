import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { menuPanelJustify } from '@/lib/menu-columns';

/**
 * The desktop menu panel opens from a button at the header's right edge. Its
 * columns used to start at the left of a five-column grid, so a site with only
 * page links got one column at the far side of the screen (synclairvision,
 * 2026-10-04). The panel follows the header's one navigation-alignment setting.
 */
const read = (p: string) => readFileSync(join(__dirname, '../../..', p), 'utf8');

describe('the menu panel follows navAlignment', () => {
  it('right by default, under the button', () => {
    expect(menuPanelJustify(undefined)).toBe('justify-end');
    expect(menuPanelJustify('right')).toBe('justify-end');
    expect(menuPanelJustify('center')).toBe('justify-center');
    expect(menuPanelJustify('left')).toBe('justify-start');
  });

  it('the panel uses it and no longer lays columns out in a left-starting grid', () => {
    const nav = read('src/components/public/PublicNavigation.tsx');
    expect(nav).toMatch(/menuPanelJustify\(headerSettings\.navAlignment\)/);
    expect(nav).not.toMatch(/grid gap-10 px-6 py-12 md:grid-cols-3 lg:grid-cols-5/);
  });
});
