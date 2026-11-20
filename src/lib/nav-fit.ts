/**
 * Whether the header's full menu fits beside the logo, or folds into the
 * menu button.
 *
 * The header switched to the menu button at one fixed width (768 px). A site
 * with eight menu items and a cart did not fit at 800 px: the last item and the
 * theme, account and cart buttons sat past the right edge, and the site clips
 * its own overflow, so a visitor never saw them (the width check found it on
 * its first run, 2026-11-20). The rule is the space, not the width: a menu that
 * does not fit folds.
 */
export type NavAlignment = 'left' | 'center' | 'right' | undefined;

/** Breathing room between the logo and the menu, and around a centred menu. */
export const NAV_GAP_PX = 32;

/** The width the full menu needs in a header row of this layout. */
export function navNeeds(logo: number, nav: number, alignment: NavAlignment): number {
  // A centred menu sits in the middle of the row; the logo must stay clear of it
  // on the left, so the row needs the logo on both sides of the menu.
  if (alignment === 'center') return 2 * (logo + NAV_GAP_PX) + nav;
  return logo + NAV_GAP_PX + nav;
}

/**
 * The next folded state. `remembered` is what the full menu needed when it was
 * last measured: a folded menu is not drawn, so it cannot be measured, and it
 * opens again only when the row is wide enough for what it needed then.
 *
 * Nothing to measure (no layout — a test, a row not drawn yet) never folds.
 */
export function nextFolded(state: { folded: boolean; remembered: number | null }, row: number, needs: number | null): { folded: boolean; remembered: number | null } {
  if (row <= 0) return state;
  if (!state.folded) {
    if (needs === null || needs <= 0) return state;
    return needs > row ? { folded: true, remembered: needs } : { folded: false, remembered: needs };
  }
  const want = state.remembered ?? Infinity;
  return row >= want ? { folded: false, remembered: want } : state;
}
