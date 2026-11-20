/**
 * Per-breakpoint overrides on a block's envelope (#939).
 *
 *   { type, data, responsive: { sm: { columns: 1 }, md: { columns: 2 }, lg: { hidden: true } } }
 *
 * Three widths, named as an operator thinks of them:
 *   sm — phones          (below 768 px)
 *   md — tablets         (768–1023 px)
 *   lg — desktops        (1024 px and up)
 *
 * Three dials per width:
 *   hidden  — the block is not shown at that width (it stays in the page).
 *   columns — how many columns a grid block lays out in (1–6). Read by the
 *             blocks in GRID_BLOCK_TYPES; every other block ignores it.
 *   align   — TEXT alignment of the block at that width (left | center | right).
 *
 * The rules (what is honoured, which blocks are grid blocks) live in
 * `supabase/functions/_shared/blocks/envelope.ts`, shared with the executor;
 * the CLASSES live here, because Tailwind reads `src/` only.
 *
 * The classes are spelled out in full: Tailwind only ships a class it can read
 * in the source, so none of them may be assembled from parts. Each one is
 * important (`!`) and bounded to its own width, so it wins over the block's
 * own layout there and leaves the other widths alone.
 */

import {
  RESPONSIVE_WIDTHS,
  normalizeResponsive,
  type ResponsiveAlign,
  type ResponsiveWidth,
} from '../../supabase/functions/_shared/blocks/envelope';

export {
  GRID_BLOCK_TYPES,
  RESPONSIVE_MAX_COLUMNS,
  RESPONSIVE_WIDTHS,
  normalizeResponsive,
  type BlockResponsive,
  type BlockResponsiveAt,
  type ResponsiveAlign,
  type ResponsiveWidth,
} from '../../supabase/functions/_shared/blocks/envelope';

const HIDDEN: Record<ResponsiveWidth, string> = {
  sm: 'max-md:!hidden',
  md: 'md:max-lg:!hidden',
  lg: 'lg:!hidden',
};

const ALIGN: Record<ResponsiveWidth, Record<ResponsiveAlign, string>> = {
  sm: {
    left: 'max-md:!text-left max-md:[&_*]:!text-left',
    center: 'max-md:!text-center max-md:[&_*]:!text-center',
    right: 'max-md:!text-right max-md:[&_*]:!text-right',
  },
  md: {
    left: 'md:max-lg:!text-left md:max-lg:[&_*]:!text-left',
    center: 'md:max-lg:!text-center md:max-lg:[&_*]:!text-center',
    right: 'md:max-lg:!text-right md:max-lg:[&_*]:!text-right',
  },
  lg: {
    left: 'lg:!text-left lg:[&_*]:!text-left',
    center: 'lg:!text-center lg:[&_*]:!text-center',
    right: 'lg:!text-right lg:[&_*]:!text-right',
  },
};

/** Grid columns and, for the masonry gallery, CSS columns — one string per width and count. */
const COLUMNS: Record<ResponsiveWidth, Record<number, string>> = {
  sm: {
    1: 'max-md:!grid-cols-1 max-md:!columns-1',
    2: 'max-md:!grid-cols-2 max-md:!columns-2',
    3: 'max-md:!grid-cols-3 max-md:!columns-3',
    4: 'max-md:!grid-cols-4 max-md:!columns-4',
    5: 'max-md:!grid-cols-5 max-md:!columns-5',
    6: 'max-md:!grid-cols-6 max-md:!columns-6',
  },
  md: {
    1: 'md:max-lg:!grid-cols-1 md:max-lg:!columns-1',
    2: 'md:max-lg:!grid-cols-2 md:max-lg:!columns-2',
    3: 'md:max-lg:!grid-cols-3 md:max-lg:!columns-3',
    4: 'md:max-lg:!grid-cols-4 md:max-lg:!columns-4',
    5: 'md:max-lg:!grid-cols-5 md:max-lg:!columns-5',
    6: 'md:max-lg:!grid-cols-6 md:max-lg:!columns-6',
  },
  lg: {
    1: 'lg:!grid-cols-1 lg:!columns-1',
    2: 'lg:!grid-cols-2 lg:!columns-2',
    3: 'lg:!grid-cols-3 lg:!columns-3',
    4: 'lg:!grid-cols-4 lg:!columns-4',
    5: 'lg:!grid-cols-5 lg:!columns-5',
    6: 'lg:!grid-cols-6 lg:!columns-6',
  },
};

/** Classes for the block's outer element: where it is hidden, and how its text aligns. */
export function responsiveShellClasses(raw: unknown): string {
  const responsive = normalizeResponsive(raw);
  if (!responsive) return '';
  const classes: string[] = [];
  for (const width of RESPONSIVE_WIDTHS) {
    const at = responsive[width];
    if (!at) continue;
    if (at.hidden) classes.push(HIDDEN[width]);
    if (at.align) classes.push(ALIGN[width][at.align]);
  }
  return classes.join(' ');
}

/** Classes for a grid block's grid element: the column count per width. */
export function responsiveGridClasses(raw: unknown): string {
  const responsive = normalizeResponsive(raw);
  if (!responsive) return '';
  const classes: string[] = [];
  for (const width of RESPONSIVE_WIDTHS) {
    const columns = responsive[width]?.columns;
    if (columns) classes.push(COLUMNS[width][columns]);
  }
  return classes.join(' ');
}

/** Hidden at every width is the same as hidden — said in one place. */
export function hiddenEverywhere(raw: unknown): boolean {
  const responsive = normalizeResponsive(raw);
  return !!responsive && RESPONSIVE_WIDTHS.every((width) => responsive[width]?.hidden);
}
