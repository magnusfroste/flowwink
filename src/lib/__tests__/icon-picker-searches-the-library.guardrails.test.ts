import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { icons } from 'lucide-react';
import { ALL_ICON_NAMES, STARTER_ICONS, SEARCH_LIMIT, searchIcons } from '@/components/admin/icon-search';

/**
 * The icon picker offers the library, not a list.
 *
 * A hand-written list of 56 icons (ten of them healthcare, the first
 * template's inheritance) hid 108 of the 137 icon names our own templates use.
 * The pick vocabulary is lucide's names, all of them; the starter set is a
 * convenience and must itself be made of real names.
 */
const root = join(__dirname, '../../..');

describe('the icon picker', () => {
  it('searches every icon in the library', () => {
    expect(ALL_ICON_NAMES.length).toBe(Object.keys(icons).length);
    expect(ALL_ICON_NAMES.length).toBeGreaterThan(1000);
  });

  it('finds by word, ranks word-starts first, caps the list', () => {
    expect(searchIcons('truck')).toContain('Truck');
    expect(searchIcons('heart pulse')[0]).toBe('HeartPulse');
    expect(searchIcons('chart')[0].startsWith('Chart')).toBe(true);
    expect(searchIcons('a').length).toBe(SEARCH_LIMIT);
    expect(searchIcons('   ')).toEqual([]);
    expect(searchIcons('shoppingcart')).toContain('ShoppingCart');
  });

  it('every starter icon exists, and no sector group survives in the source', () => {
    for (const n of STARTER_ICONS) expect(n in icons, `${n} is not a lucide icon`).toBe(true);
    const src = readFileSync(join(root, 'src/components/admin/IconPicker.tsx'), 'utf-8');
    expect(src, 'a hand-written icon group is the shape that hid the library').not.toMatch(/ICON_GROUPS|'Healthcare'\s*:/);
    expect(src).toContain("from '@/components/admin/icon-search'");
    expect(src, 'cmdk must not re-filter the whole library itself').toContain('shouldFilter={false}');
  });

  it('the icons our templates use are all reachable by search', () => {
    const dir = join(root, 'src/data/templates');
    const names = new Set<string>();
    for (const f of readdirSync(dir).filter((f) => f.endsWith('.ts'))) {
      for (const m of readFileSync(join(dir, f), 'utf-8').matchAll(/icon: '([A-Z][A-Za-z0-9]+)'/g)) names.add(m[1]);
    }
    const unreachable = [...names].filter((n) => n in icons && !searchIcons(n).includes(n));
    expect(unreachable).toEqual([]);
  });
});
