import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { NAV_GAP_PX, navNeeds, nextFolded } from '../nav-fit';

/**
 * The header's full menu folds into the menu button when it does not fit —
 * by the space it needs, not by the window's width. At 768 px a site with
 * seven items and a cart drew its last item and its buttons past the right
 * edge, where the site's own clipping hid them (the width check, 2026-11-20).
 */
describe('does the full menu fit', () => {
  it('needs the logo, a gap and the menu', () => {
    expect(navNeeds(150, 800, 'right')).toBe(150 + NAV_GAP_PX + 800);
    expect(navNeeds(150, 800, undefined)).toBe(150 + NAV_GAP_PX + 800);
    expect(navNeeds(150, 800, 'left')).toBe(150 + NAV_GAP_PX + 800);
  });

  it('a centred menu needs the logo on both sides of it', () => {
    expect(navNeeds(150, 600, 'center')).toBe(2 * (150 + NAV_GAP_PX) + 600);
  });

  it('folds when it does not fit, and remembers what it needed', () => {
    expect(nextFolded({ folded: false, remembered: null }, 976, 991)).toEqual({ folded: true, remembered: 991 });
    expect(nextFolded({ folded: false, remembered: null }, 1012, 991)).toEqual({ folded: false, remembered: 991 });
  });

  it('a folded menu opens again only where it fitted', () => {
    const folded = { folded: true, remembered: 991 };
    expect(nextFolded(folded, 990, null)).toBe(folded);
    expect(nextFolded(folded, 991, null)).toEqual({ folded: false, remembered: 991 });
  });

  it('nothing measured never folds — a test, or a row not drawn yet', () => {
    const open = { folded: false, remembered: null };
    expect(nextFolded(open, 0, 991)).toBe(open);
    expect(nextFolded(open, 900, null)).toBe(open);
    expect(nextFolded(open, 900, 0)).toBe(open);
  });
});

describe('the header follows the measurement', () => {
  const nav = readFileSync('src/components/public/PublicNavigation.tsx', 'utf8');

  it('the full menu is hidden when folded, the menu button shown', () => {
    expect(nav).toMatch(/folded \? "hidden" : "hidden md:flex items-center gap-2"/);
    expect(nav).toMatch(/className=\{cn\("flex items-center gap-2", !folded && "md:hidden"\)\}/);
  });

  it('every part of the phone menu opens at any width when folded — no fixed md:hidden left on them', () => {
    // A phone-menu part still carrying a bare md:hidden would vanish on a folded tablet.
    const bare = nav.split('\n').filter((line) => /["'`\s]md:hidden/.test(line) && !/!folded && "md:hidden"/.test(line));
    expect(bare).toEqual([]);
  });

  it('a menu item stays on one line, so a menu that does not fit cannot hide it by wrapping', () => {
    expect(nav).toMatch(/const base = 'px-4 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap';/);
  });

  it('the desktop menu panel does not open beside the folded phone menu', () => {
    expect(nav).toMatch(/\{desktopHamburger && !folded && mobileMenuOpen && \(/);
  });
});
