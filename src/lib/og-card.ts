/**
 * The DERIVED social card — what a link to a page shows when nobody uploaded
 * an og:image: composed at request time from the site's branding and the
 * page's own title, description and picture (api/og.ts renders it; this
 * module is the pure model so it can be tested without a renderer).
 *
 * Synclair, 2026-10-21: the only ways to a social image were an upload or a
 * page's raw photo. The connected agent, with no image tool that knew the
 * brand, uploaded a card with the OLD rainbow logo and a serif title onto
 * twelve pages; the home page shared a bare 2880 px thermal photo. A card
 * drawn from the brand dials needs no upload and cannot be off-brand.
 *
 * Precedence in the shell (api/html.ts): a page's own og_image, then the
 * site's seo.ogImage, then THIS card. Explicit beats derived; derived beats
 * nothing.
 */
export interface OgBranding {
  primaryColor?: string;
  primaryColorDark?: string;
  accentColor?: string;
  backgroundColor?: string;
  backgroundColorDark?: string;
  defaultTheme?: string;
  logo?: string;
  logoDark?: string;
  headingTransform?: string;
  organizationName?: string;
}

export interface OgCardInput {
  title: string;
  description?: string;
  siteName?: string;
  /** Small lead-in above the title, e.g. the site name or a section. */
  eyebrow?: string;
  /** The page's picture (http(s) URL); data: URIs and empty strings are dropped. */
  picture?: string | null;
  branding?: OgBranding | null;
}

export interface OgCardModel {
  width: 1200;
  height: 630;
  dark: boolean;
  ground: string;
  foreground: string;
  muted: string;
  accent: string;
  primary: string;
  /** The logo for this ground (white on dark, black on light), or null. */
  logo: string | null;
  eyebrow: string;
  /** Title lines, transformed per the heading dial, at most 3. */
  titleLines: string[];
  titleSize: number;
  description: string;
  picture: string | null;
}

const hsl = (v: string | undefined, fallback: string): string => (v && v.trim() ? `hsl(${v.trim()})` : fallback);

/** Wrap a title into at most `maxLines` lines of about `perLine` characters, on word boundaries. */
export function wrapTitle(title: string, perLine: number, maxLines: number): string[] {
  const words = title.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if (cur && (cur + ' ' + w).length > perLine) { lines.push(cur); cur = w; } else cur = cur ? `${cur} ${w}` : w;
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = kept[maxLines - 1].replace(/[.,;:]?$/, '') + '…';
    return kept;
  }
  return lines;
}

/** Column width the title must fit (px), with and without a picture. */
export const TITLE_WIDTH = { withPicture: 520, full: 1040 } as const;
/** Bold Inter caps measure ≈ 0.72 em per character on average; mixed case ≈ 0.58 em (checked against a rendered card, 2026-10-21). */
const EM_PER_CHAR = { upper: 0.72, mixed: 0.58 } as const;

/** The largest size (76 → 44) at which the title fits `widthPx` in at most three lines. */
export function fitTitle(title: string, widthPx: number, upper: boolean): { lines: string[]; size: number } {
  const em = upper ? EM_PER_CHAR.upper : EM_PER_CHAR.mixed;
  for (const size of [76, 68, 60, 52, 44]) {
    const perLine = Math.max(6, Math.floor(widthPx / (size * em)));
    const lines = wrapTitle(title, perLine, 3);
    const fits = lines.every((l) => l.length <= perLine) && !lines[lines.length - 1].endsWith('…');
    if (fits || size === 44) return { lines, size };
  }
  return { lines: [title], size: 44 };
}

export function ogCardModel(input: OgCardInput): OgCardModel {
  const b = input.branding || {};
  const dark = b.defaultTheme === 'dark';
  const ground = dark ? hsl(b.backgroundColorDark, '#0f131a') : hsl(b.backgroundColor, '#fcfcfd');
  const foreground = dark ? '#f0f2f5' : '#171c26';
  const muted = dark ? 'rgba(240,242,245,0.72)' : 'rgba(23,28,38,0.68)';
  const primary = dark ? hsl(b.primaryColorDark || b.primaryColor, '#8fb3ff') : hsl(b.primaryColor, '#1f3a8a');
  const accent = hsl(b.accentColor, primary);
  const logo = (dark ? b.logoDark || b.logo : b.logo || b.logoDark) || null;
  const upper = b.headingTransform === 'uppercase';
  const rawTitle = (input.title || input.siteName || '').trim();
  const title = upper ? rawTitle.toUpperCase() : rawTitle;
  const pic = (input.picture || '').trim();
  const picture = /^https?:\/\//i.test(pic) ? pic : null;
  const { lines: titleLines, size: titleSize } = fitTitle(title, picture ? TITLE_WIDTH.withPicture : TITLE_WIDTH.full, upper);
  const desc = (input.description || '').trim();
  return {
    width: 1200, height: 630, dark, ground, foreground, muted, accent, primary,
    logo: logo && /^https?:\/\//i.test(logo) ? logo : null,
    eyebrow: (input.eyebrow || input.siteName || b.organizationName || '').trim(),
    titleLines, titleSize,
    description: desc.length > 150 ? desc.slice(0, 147).replace(/\s+\S*$/, '') + '…' : desc,
    picture,
  };
}

/** The og:image the shell emits: the explicit one when set, else the derived card for this path. */
export function resolveOgImage(explicit: string | null | undefined, origin: string, path: string): string {
  const e = (explicit || '').trim();
  if (e) return e;
  return `${origin.replace(/\/+$/, '')}/api/og?path=${encodeURIComponent(path || '/')}`;
}

/** The first picture a page's blocks carry (an http(s) URL — data URIs are not a social image). */
export function firstBlockPicture(blocks: unknown): string | null {
  if (!Array.isArray(blocks)) return null;
  for (const b of blocks as { type?: string; data?: Record<string, unknown> }[]) {
    const d = b?.data || {};
    for (const key of ['backgroundImage', 'imageSrc', 'image', 'src', 'videoPosterUrl']) {
      const v = d[key];
      if (typeof v === 'string' && /^https?:\/\//i.test(v) && !/\.(svg)(\?|$)/i.test(v)) return v;
    }
  }
  return null;
}
