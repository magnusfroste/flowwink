/**
 * The block ENVELOPE's own rules — the keys next to `type` and `data` that the
 * renderer's shell reads — shared by the app (which turns them into classes)
 * and the executor (which stores what an agent wrote). No imports: the app's
 * type check and Deno both read this file.
 *
 * `responsive` (#939) is per-width overrides:
 *   sm — phones (below 768 px) · md — tablets (768–1023 px) · lg — desktops (1024 px and up)
 * each `{ hidden?: true, columns?: 1–6, align?: left | center | right }`.
 */

export type ResponsiveWidth = 'sm' | 'md' | 'lg';
export type ResponsiveAlign = 'left' | 'center' | 'right';

export interface BlockResponsiveAt {
  hidden?: boolean;
  columns?: number;
  align?: ResponsiveAlign;
}

export type BlockResponsive = Partial<Record<ResponsiveWidth, BlockResponsiveAt>>;

export const RESPONSIVE_WIDTHS: readonly ResponsiveWidth[] = ['sm', 'md', 'lg'];
export const RESPONSIVE_MAX_COLUMNS = 6;

/** The blocks whose layout is a grid of equal columns — the ones `columns` reaches. */
export const GRID_BLOCK_TYPES: readonly string[] = [
  'features', 'team', 'testimonials', 'pricing', 'link-grid', 'gallery',
  'products', 'latest-posts', 'article-grid', 'trust-bar', 'category-nav',
];

export const SECTION_BACKGROUNDS: readonly string[] = ['none', 'muted', 'accent', 'dark'];

const isAlign = (value: unknown): value is ResponsiveAlign =>
  value === 'left' || value === 'center' || value === 'right';

/**
 * What an author wrote, reduced to what the renderer honours. Anything else —
 * an unknown width, a column count outside 1–6, a misspelt alignment — is
 * dropped rather than guessed at; an empty result is `undefined`, so a block
 * without overrides carries none.
 */
export function normalizeResponsive(raw: unknown): BlockResponsive | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const out: BlockResponsive = {};
  for (const width of RESPONSIVE_WIDTHS) {
    const at = (raw as Record<string, unknown>)[width];
    if (!at || typeof at !== 'object' || Array.isArray(at)) continue;
    const source = at as Record<string, unknown>;
    const next: BlockResponsiveAt = {};
    if (source.hidden === true) next.hidden = true;
    const columns = Number(source.columns);
    if (Number.isInteger(columns) && columns >= 1 && columns <= RESPONSIVE_MAX_COLUMNS) next.columns = columns;
    if (isAlign(source.align)) next.align = source.align;
    if (Object.keys(next).length) out[width] = next;
  }
  return Object.keys(out).length ? out : undefined;
}

/** What `responsive` held that the renderer would NOT honour — said back to the caller. */
export function responsiveProblems(raw: unknown): string[] {
  if (raw === undefined || raw === null) return [];
  if (typeof raw !== 'object' || Array.isArray(raw)) return ['responsive must be an object: { sm?, md?, lg? }'];
  const problems: string[] = [];
  for (const [width, at] of Object.entries(raw as Record<string, unknown>)) {
    if (!RESPONSIVE_WIDTHS.includes(width as ResponsiveWidth)) {
      problems.push(`responsive.${width}: unknown width — use sm (phones), md (tablets) or lg (desktops)`);
      continue;
    }
    if (!at || typeof at !== 'object' || Array.isArray(at)) {
      problems.push(`responsive.${width} must be an object: { hidden?, columns?, align? }`);
      continue;
    }
    for (const [key, value] of Object.entries(at as Record<string, unknown>)) {
      if (key === 'hidden') {
        if (typeof value !== 'boolean') problems.push(`responsive.${width}.hidden must be true or false`);
      } else if (key === 'columns') {
        const n = Number(value);
        if (!Number.isInteger(n) || n < 1 || n > RESPONSIVE_MAX_COLUMNS) problems.push(`responsive.${width}.columns must be a whole number 1–${RESPONSIVE_MAX_COLUMNS}`);
      } else if (key === 'align') {
        if (!isAlign(value)) problems.push(`responsive.${width}.align must be left, center or right`);
      } else {
        problems.push(`responsive.${width}.${key}: unknown key — the keys are hidden, columns, align`);
      }
    }
  }
  return problems;
}

/**
 * The envelope keys a single-block write may carry beside its data. Returns
 * what to set, what to clear (a key sent as null), and what was wrong — a
 * wrong value is refused, never stored half-understood.
 */
export function readEnvelopeArgs(args: Record<string, unknown>, blockType: string): {
  set: Record<string, unknown>;
  clear: string[];
  problems: string[];
  notes: string[];
} {
  const set: Record<string, unknown> = {};
  const clear: string[] = [];
  const problems: string[] = [];
  const notes: string[] = [];

  if ('responsive' in args) {
    if (args.responsive === null) clear.push('responsive');
    else {
      problems.push(...responsiveProblems(args.responsive));
      const responsive = normalizeResponsive(args.responsive);
      if (responsive) {
        set.responsive = responsive;
        const wantsColumns = RESPONSIVE_WIDTHS.some((width) => responsive[width]?.columns);
        if (wantsColumns && !GRID_BLOCK_TYPES.includes(blockType)) {
          notes.push(`responsive.columns is stored but a "${blockType}" block does not lay out in equal columns, so it changes nothing there. It reaches: ${GRID_BLOCK_TYPES.join(', ')}.`);
        }
      } else if (!problems.length) clear.push('responsive');
    }
  }

  if ('sectionBackground' in args) {
    const value = args.sectionBackground;
    if (value === null || value === '') clear.push('sectionBackground');
    else if (typeof value === 'string' && SECTION_BACKGROUNDS.includes(value)) set.sectionBackground = value;
    else problems.push(`sectionBackground must be one of ${SECTION_BACKGROUNDS.join(', ')}`);
  }

  if ('anchorId' in args) {
    const value = args.anchorId;
    if (value === null || value === '') clear.push('anchorId');
    else if (typeof value === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(value)) set.anchorId = value;
    else problems.push('anchorId must be lowercase letters, digits and hyphens (e.g. "pricing")');
  }

  return { set, clear, problems, notes };
}

/** The envelope keys of a stored block, for an answer. */
export function envelopeOf(block: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of ['sectionBackground', 'anchorId', 'responsive'] as const) {
    if (block[key] !== undefined && block[key] !== null) out[key] = block[key];
  }
  return out;
}
