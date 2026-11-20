import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { navNeeds, nextFolded, type NavAlignment } from '@/lib/nav-fit';

/**
 * Folds the header's full menu into the menu button when it does not fit
 * beside the logo — measured, not guessed from the window's width.
 * `contentKey` changes when the menu's items change: the menu is unfolded and
 * measured again.
 */
export function useNavFits(
  rowRef: RefObject<HTMLElement>,
  logoRef: RefObject<HTMLElement>,
  navRef: RefObject<HTMLElement>,
  alignment: NavAlignment,
  contentKey: string,
): boolean {
  const [state, setState] = useState<{ folded: boolean; remembered: number | null }>({ folded: false, remembered: null });
  const stateRef = useRef(state);
  stateRef.current = state;

  // New items, new width: show the full menu and measure it again.
  useLayoutEffect(() => {
    setState({ folded: false, remembered: null });
  }, [contentKey, alignment]);

  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const judge = () => {
      const nav = navRef.current;
      const logo = logoRef.current;
      // A nav that is not drawn (folded, or below the tablet width) measures as 0: nothing new to learn.
      const drawn = nav && nav.offsetParent !== null ? nav.scrollWidth : 0;
      const needs = drawn > 0 ? navNeeds(logo?.offsetWidth ?? 0, drawn, alignment) : null;
      const next = nextFolded(stateRef.current, row.clientWidth, needs);
      const cur = stateRef.current;
      if (next.folded !== cur.folded || next.remembered !== cur.remembered) setState(next);
    };
    judge();
    if (typeof ResizeObserver === 'undefined') return;
    const watch = new ResizeObserver(judge);
    watch.observe(row);
    if (navRef.current) watch.observe(navRef.current);
    return () => watch.disconnect();
  }, [rowRef, logoRef, navRef, alignment, state.folded, contentKey]);

  return state.folded;
}
