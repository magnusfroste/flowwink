/**
 * The HTML shell with the page's own head — ONE document for every reader.
 *
 * Vite ships a brandless `index.html` (`<title>Website</title>`, no
 * description). Until 2026-10-04 only a hand-listed set of social and AI
 * crawlers were routed to a prerender that carried the real title; browsers,
 * Googlebot, Bingbot, curl and every operator's own check got the static shell
 * and read "Website" (Hermes on synclairvision). The list was a guard that
 * enumerated: every reader it did not name saw the wrong title.
 *
 * `injectHead` takes the shell the build produced and the per-page head tags,
 * and returns the same shell with the head filled in. The SPA then hydrates
 * on top; react-helmet-async owns tags marked `data-rh`, so it reconciles the
 * server-injected ones instead of adding a second set.
 */

export interface ShellHead {
  /** Tags for <head>, each a complete element string (title, meta, link). */
  tags: string[];
  /** BCP-47 language of the page, for <html lang>. */
  lang?: string | null;
  /**
   * The customer's favicon (branding.favicon). The build's index.html carries
   * the PLATFORM's icon; until 2026-10-21 the shell left it there and only
   * the hydrated app swapped it (applyFavicon) — so a crawler, a link preview,
   * a bookmark made before JS ran, and a tab's first paint showed FlowWink's
   * mark on a customer's site (synclair). With an icon the shell's static
   * icon links are replaced by this one.
   */
  icon?: string | null;
}

export const HELMET_ATTR = 'data-rh="true"';

/** MIME type from the icon's extension or data: prefix; null when unknown (the browser sniffs). */
export function iconMimeType(href: string): string | null {
  const data = /^data:([^;,]+)[;,]/i.exec(href);
  if (data) return data[1];
  const ext = (href.split(/[?#]/)[0].match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();
  return { svg: 'image/svg+xml', png: 'image/png', ico: 'image/x-icon', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' }[ext] ?? null;
}

/** The icon link(s) for a branding favicon: rel=icon with its type, and apple-touch-icon for a raster. */
export function iconTags(href: string): string[] {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  const type = iconMimeType(href);
  const tags = [`<link rel="icon"${type ? ` type="${type}"` : ''} href="${esc(href)}">`];
  if (type && type !== 'image/svg+xml' && type !== 'image/x-icon') tags.push(`<link rel="apple-touch-icon" href="${esc(href)}">`);
  return tags;
}

/** Mark a head element as Helmet-managed so hydration replaces it, never duplicates it. */
export function helmetOwned(tag: string): string {
  if (tag.includes('data-rh=')) return tag;
  return tag.replace(/^<(title|meta|link)\b/, `<$1 ${HELMET_ATTR}`);
}

/**
 * Replace the shell's placeholder title and structural social tags with the
 * page's head. Pure: the same shell and head always give the same document.
 * Throws when the shell has no <title> — the caller then serves the shell
 * untouched rather than a half-rewritten document.
 */
export function injectHead(shell: string, head: ShellHead): string {
  if (!/<title>[^<]*<\/title>/.test(shell)) {
    throw new Error('shell has no <title> to replace');
  }
  let out = shell;
  // The structural og:type / twitter:card the shell carries as defaults are
  // replaced by the page's own (an article is not type "website", a page with
  // no image is not a large-image card).
  out = out.replace(/\n[ \t]*<meta property="og:type" content="[^"]*" \/>/, '');
  out = out.replace(/\n[ \t]*<meta name="twitter:card" content="[^"]*" \/>/, '');
  const tags = head.tags.filter(Boolean).map(helmetOwned);
  if (head.icon) {
    out = out.replace(/\n[ \t]*<link rel="icon"[^>]*>/g, '');
    out = out.replace(/\n[ \t]*<link rel="apple-touch-icon"[^>]*>/g, '');
    // NOT helmetOwned: react-helmet-async removes every data-rh tag it does
    // not render itself on its next update, and no page renders an icon. A
    // marked icon survived the first paint and vanished on the first click
    // (synclair 2026-10-23: the logo link home swapped the tab to the
    // domain's own /favicon.ico — FlowWink's). The icon is the shell's, not Helmet's.
    tags.push(...iconTags(head.icon));
  }
  // Keep the shell's own indentation (4 spaces under <head>) so the output
  // reads like the file the build wrote.
  out = out.replace(/<title>[^<]*<\/title>/, tags.join('\n    '));
  if (head.lang && /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(head.lang)) {
    out = out.replace(/<html\b([^>]*?)\slang="[^"]*"/, `<html$1 lang="${head.lang.toLowerCase()}"`);
  }
  return out;
}

/**
 * The cache policy the shell is served with. It follows the same dial as
 * `get-page`: with edge caching ON the CDN keeps the document for the
 * configured minutes; OFF means a 30-second micro-cache — enough that a traffic
 * spike does not turn every navigation into a database read, short enough that
 * an SEO edit shows within half a minute. Browsers always revalidate
 * (`max-age=0`): the CDN is the cache, the visitor's disk is not.
 */
export function shellCacheControl(perf: { enableEdgeCaching?: boolean; edgeCacheTtlMinutes?: number } | null | undefined): string {
  const on = perf?.enableEdgeCaching === true;
  const minutes = Math.max(1, Math.min(60, Number(perf?.edgeCacheTtlMinutes) || 5));
  const sMaxAge = on ? minutes * 60 : 30;
  return `public, max-age=0, s-maxage=${sMaxAge}, stale-while-revalidate=${on ? 60 : 300}`;
}
