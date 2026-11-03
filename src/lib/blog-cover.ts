/**
 * Blog covers — what a post's picture is, as a per-site dial.
 *
 * www.flowwink.com's blog showed an Unsplash photo per post, chosen by a
 * keyword search: a Swiss knife, a scanned page, an "EO" sign. Off-topic and
 * incoherent next to each other. `blog.coverStyle: 'brand'` draws every
 * post's picture from the site's own branding instead (BlogCover on the page,
 * the derived /api/og card on a share) — consistent, never off-topic, zero
 * cost per image. 'photo' (the default) is the featured image, as always.
 *
 * Pure functions, no React and no I/O: the page, the cards, the latest-posts
 * block, the shell (api/html.ts) and the card renderer (api/og.ts) read the
 * dial through the same three answers here.
 */
import { resolveOgImage } from './og-card';

export type BlogCoverStyle = 'photo' | 'brand';

/** The dial, from a `blog` settings value of any shape. Anything but 'brand' is 'photo' — no behaviour change by accident. */
export function blogCoverStyle(settings: unknown): BlogCoverStyle {
  const v = settings && typeof settings === 'object' ? (settings as { coverStyle?: unknown }).coverStyle : undefined;
  return v === 'brand' ? 'brand' : 'photo';
}

/**
 * The dial as a page sees it while the settings load: 'pending' until the
 * `blog` row has been read. Assuming 'photo' while loading flashed the stock
 * photo on a brand-mode site before the cover replaced it.
 */
export type BlogCoverDial = BlogCoverStyle | 'pending';

/**
 * The dial from the settings query's state: the loaded value when there is
 * one (a failed REFETCH keeps the cached value); a read that failed with
 * nothing cached falls back to 'photo' — the platform's behaviour before the
 * dial existed; nothing yet is 'pending'.
 */
export function coverDialFromQuery(q: { data: unknown; isError: boolean }): BlogCoverDial {
  if (q.data !== undefined) return blogCoverStyle(q.data);
  if (q.isError) return 'photo';
  return 'pending';
}

/**
 * Does this post get a picture slot at all? Brand mode: always. Photo mode:
 * when it has a featured image. Pending: the same as photo — the slot a photo
 * would take is held by a neutral placeholder (PostPicture), so a post with an
 * image keeps its layout whichever way the dial resolves.
 */
export function hasPostPicture(post: { featured_image?: string | null }, style: BlogCoverDial): boolean {
  return style === 'brand' || !!(post.featured_image && post.featured_image.trim());
}

/**
 * A stable number from a string (FNV-1a, 32-bit) — the cover's dither seed.
 * Same slug, same cover on every device and visit; no Math.random at render.
 */
export function coverSeed(seed: string): number {
  let h = 0x811c9dc5;
  const s = String(seed ?? '');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  // PixelGradient hashes (x, y, seed) with Math.imul; keep it a positive int.
  return (h % 1_000_003) + 1;
}

/**
 * The letter the compact cover shows: the first letter of the title's first
 * word of four or more letters or digits, upper-cased — else its first letter.
 * The title's own first letter put a "T" on every "The …" post and a "W" on
 * every "Why …", so a row of thumbs read as one picture repeated (www,
 * 2026-10-30). By length, not by a stop-word list: it holds in every language.
 */
export function coverInitial(title: string): string {
  const words = String(title ?? '').match(/[\p{L}\p{N}]+/gu) ?? [];
  const word = words.find((w) => [...w].length >= 4) ?? words[0];
  return word ? [...word][0].toLocaleUpperCase() : '';
}

/**
 * How much of the cover the pixel band fills, by the post's seed. `full` is
 * a cover that carries its title: a modest band (a third, ±4) under the text.
 * `compact` is the motif alone (a thumb, or a card in a narrow slot): from a
 * quarter to three quarters — the band's height is what tells one compact
 * cover from the next, so it spans enough to see at 80 px.
 */
export function coverBand(seed: number, variant: 'hero' | 'card' | 'thumb'): { full: number; compact: number } {
  const full = (variant === 'hero' ? 34 : 32) + (seed % 9);
  const compact = 26 + (Math.floor(seed / 9) % 47);
  return { full, compact };
}

/**
 * The share image (og:image) of a post. An explicit meta.ogImage always wins.
 * Brand mode: the derived brand card for the post's own address (/api/og),
 * never the featured photo. Photo mode: the featured image, else nothing (the
 * page's caller falls back to the site's image or the derived card).
 */
export function blogShareImage(input: {
  style: BlogCoverStyle;
  metaOgImage?: string | null;
  featuredImage?: string | null;
  origin: string;
  path: string;
}): string | null {
  const explicit = (input.metaOgImage || '').trim();
  if (explicit) return explicit;
  if (input.style === 'brand') return resolveOgImage(null, input.origin, input.path);
  const photo = (input.featuredImage || '').trim();
  return photo || null;
}

/** The picture the derived card (api/og) puts beside a post's title: none in brand mode — the card IS the brand cover. */
export function blogCardPicture(style: BlogCoverStyle, featuredImage: string | null | undefined): string | null {
  if (style === 'brand') return null;
  const photo = (featuredImage || '').trim();
  return photo || null;
}

/**
 * The brand's SHORT name — a cover's or a share card's eyebrow when a post
 * has no category. The organisation's name when branding sets one; else the
 * site title up to its first separator ("FlowWink — The Business Operating
 * System" → "FlowWink"). The whole SEO title stood there on www and was cut
 * to "FLOWWINK — …" in every card.
 */
export function shortBrandName(input: { organizationName?: unknown; siteTitle?: unknown }): string {
  const org = typeof input.organizationName === 'string' ? input.organizationName.trim() : '';
  if (org) return org;
  const title = typeof input.siteTitle === 'string' ? input.siteTitle.trim() : '';
  const head = title.split(/\s+[—–|·:-]\s+/)[0].trim();
  return head || title;
}
