/**
 * site-sensor — what a page IS, never what it should BECOME.
 *
 * migrate_url used to do both jobs in one call: scrape a page, then ask a model
 * to turn it into FlowWink blocks. The A/B against an agent with a browser
 * (2026-08-08, restagard.se) showed the split cleanly:
 *
 *   - the extraction was genuinely good — accurate profile, real text, and it
 *     discovered 48 pages the agent never would have found by reading a menu;
 *   - the composition was not, and could not be: the source has no hero, no CTA
 *     and no section boundaries to extract. Those are decisions, not data.
 *
 * So the pipeline becomes a sensor. It reports observations; the agent composes.
 * That is the same rule blocks already follow (Law 3): capture, don't pipeline.
 *
 * The second half of this file exists because the old response LIED. It answered
 * `imagesFound: 0` for a page full of images, `branding: {}` for a site with a
 * palette, and it silently took the single <h1> ("Resta gård") as every
 * subpage's title. All three had the same cause: a client-rendered page returns
 * a JS shell, and nothing in the response distinguished "the site has none of
 * this" from "I could not see it". Every count here travels with a render
 * report saying how it was obtained and how much to trust it.
 */

import { extractBranding, type FirecrawlBranding, type ExtractedBranding } from './extract-branding.ts';

// ---------------------------------------------------------------------------
// Render report — the honesty layer
// ---------------------------------------------------------------------------

export type RenderStrategy = 'firecrawl' | 'firecrawl-retry' | 'jina' | 'relay' | 'direct';
export type RenderConfidence = 'high' | 'partial' | 'shell';

export interface RenderReport {
  strategy: RenderStrategy;
  html_bytes: number;
  text_chars: number;
  client_rendered: boolean;
  confidence: RenderConfidence;
  reason: string;
  suggestion?: string;
}

/** Markers of a framework that paints the page after load. */
const SPA_MARKERS = [
  /<div[^>]+id=["'](root|app|__next|__nuxt)["']/i,
  /__NEXT_DATA__/,
  /window\.__NUXT__/,
  /ng-version=/i,
  /data-svelte-h=/i,
  /<flt-glass-pane/i,
];

/** Length of the text a human would actually read. */
export function visibleTextLength(html: string): number {
  if (!html) return 0;
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return stripped.length;
}

/**
 * Did we read the page, or its loading shell?
 *
 * The threshold is deliberately generous: a real page that happens to be short
 * gets `partial`, not `shell`. Only "large HTML, almost no text" — the exact
 * signature of a framework mount point — is called a shell, because that is the
 * one case where a zero means "blind", not "empty".
 */
export function assessRender(
  html: string,
  readableText: string,
  strategy: RenderStrategy,
): RenderReport {
  const html_bytes = html?.length ?? 0;
  // The scraper's own markdown is the better signal when we have it; fall back
  // to counting text nodes in the HTML.
  const text_chars = Math.max(readableText?.trim().length ?? 0, visibleTextLength(html));
  const spa = SPA_MARKERS.some((m) => m.test(html || ''));

  if (text_chars >= 600) {
    return {
      strategy, html_bytes, text_chars,
      client_rendered: spa,
      confidence: 'high',
      reason: spa
        ? `${text_chars} characters of readable text — the framework shell rendered before capture.`
        : `${text_chars} characters of readable text.`,
    };
  }

  if (html_bytes > 4000 && text_chars < 200) {
    return {
      strategy, html_bytes, text_chars,
      client_rendered: true,
      confidence: 'shell',
      reason: `${html_bytes} bytes of HTML but only ${text_chars} characters of text — this is a JavaScript shell, not the page. Counts below are what the SHELL contains, not what the site contains.`,
      suggestion: 'Re-read this URL through a real browser: browser_fetch with force_relay=true, or pass the browser result back as relay_result. Do NOT compose a page from this observation.',
    };
  }

  return {
    strategy, html_bytes, text_chars,
    client_rendered: spa,
    confidence: 'partial',
    reason: `Only ${text_chars} characters of readable text. The page may be genuinely short, or only partly rendered.`,
    suggestion: 'Check the headings and text below against the live page before composing. If they look truncated, re-read with browser_fetch force_relay=true.',
  };
}

// ---------------------------------------------------------------------------
// Title candidates — all of them, never one silent pick
// ---------------------------------------------------------------------------

export interface TitleCandidate {
  value: string;
  source: 'document_title' | 'og_title' | 'h1' | 'url_slug';
  confidence: 'high' | 'medium' | 'low';
  note?: string;
}

const TITLE_SEPARATORS = /\s+[|–—·»-]\s+/;

/** "Mjölk & mejeri | Resta gård" → { page: "Mjölk & mejeri", site: "Resta gård" } */
export function splitDocumentTitle(raw: string): { page: string; site?: string } {
  const parts = (raw || '').split(TITLE_SEPARATORS).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return { page: (raw || '').trim() };
  // The site name is the shorter, repeated end — conventionally last, but some
  // sites lead with it.
  const [first, ...rest] = parts;
  const last = rest[rest.length - 1];
  if (first.length <= last.length && rest.length === 1) {
    return { page: last, site: first };
  }
  return { page: first, site: last };
}

/**
 * The site name the page DECLARES, from sources that cannot be the page's own
 * title: og:site_name, the suffix after a <title> separator, or the alt text of
 * the logo in the header. Null when the page declares none.
 *
 * The distinction matters: deriving the site name from the whole <title> and
 * then comparing the two is circular — every single-word title would look like
 * a site name. Only a non-circular source may disqualify a title candidate.
 */
export function declaredSiteName(html: string): string | null {
  const og = html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i)?.[1]
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:site_name["']/i)?.[1];
  if (og?.trim()) return og.trim();

  const raw = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, ' ').trim() || '';
  const { site } = splitDocumentTitle(raw);
  if (site) return site;

  // The logo's alt text names the company on essentially every site that has a
  // logo — and it is never the current page's title.
  const header = html.match(/<header[\s\S]{0,4000}?<\/header>/i)?.[0] || html.slice(0, 4000);
  const logoAlt = header.match(/<img[^>]*(?:logo|brandmark|wordmark)[^>]*\balt=["']([^"']+)["']/i)?.[1]
    || header.match(/<img[^>]*\balt=["']([^"']+)["'][^>]*(?:logo|brandmark|wordmark)[^>]*>/i)?.[1];
  if (logoAlt?.trim()) return logoAlt.trim();

  return null;
}

/**
 * The site's name for display. Falls back past the declared sources to the
 * <title> itself and then the host — a survey always wants a name.
 */
export function siteNameFrom(html: string, baseUrl: string): string {
  const declared = declaredSiteName(html);
  if (declared) return declared;

  const raw = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, ' ').trim() || '';
  const { page } = splitDocumentTitle(raw);
  if (page) return page;

  try { return new URL(baseUrl).host.replace(/^www\./, ''); } catch { return baseUrl; }
}

function titleCase(slug: string): string {
  // Split on whitespace rather than \b — \w is ASCII-only, so /mjölk/ came back
  // as "MjöLk": ö is not a word character, which makes the l after it a word
  // start. Anything touching Swedish slugs has to be Unicode-aware.
  return slug.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim()
    .split(' ')
    .map((w) => (w ? w[0].toLocaleUpperCase() + w.slice(1) : w))
    .join(' ');
}

/**
 * The exact failure this replaces: every subpage of restagard.se has one <h1>
 * and it is the site name. A composer that takes `h1` as the title produces
 * nine pages called "Resta gård". The sensor's job is to hand over the
 * disagreement, not to resolve it silently.
 */
export function titleCandidates(
  html: string,
  metadataTitle: string | undefined,
  url: string,
  /**
   * The site name, when the caller already knows it — survey returns it, and on
   * a site like restagard.se it is the ONLY way to know. That site declares no
   * og:site_name, its logo carries alt="", and it ships <title>Resta Gård</title>
   * on every page. Nothing in a single page's markup can tell you that title is
   * the company; the homepage's title can, and the survey read the homepage.
   */
  knownSiteName?: string,
): { candidates: TitleCandidate[]; recommended: string; h1_is_site_name: boolean; title_is_site_name: boolean } {
  const candidates: TitleCandidate[] = [];

  // The <title> ELEMENT wins over the scraper's metadata.title. Proven on
  // restagard.se: Jina reported "Hur kan jag köpa era produkter?" — an FAQ
  // heading somewhere down the page — while the tag said "Resta gård". A
  // derived field is a guess; the tag is the document's own answer.
  const rawDoc = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
    || metadataTitle
    || '').replace(/\s+/g, ' ').trim();
  const { page: docPage, site: docSite } = splitDocumentTitle(rawDoc);

  const ogTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1]?.trim()
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i)?.[1]?.trim()
    || '';

  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]
    ?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || '';

  let slug = '';
  try {
    slug = decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() || '');
  } catch { /* url may be relative, or the escape may be malformed */ }

  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
  const siteName = knownSiteName?.trim() || declaredSiteName(html) || docSite || '';
  const isSiteName = (s: string) => !!siteName && norm(s) === norm(siteName);

  const h1_is_site_name = !!h1 && isSiteName(h1);
  const title_is_site_name = !!docPage && isSiteName(docPage);

  const SITE_NAME_NOTE =
    'Identical to the SITE name, so it is the same on every page of this site. ' +
    'Using it as the page title names every page after the company.';

  if (docPage) {
    candidates.push({
      value: docPage,
      source: 'document_title',
      confidence: title_is_site_name ? 'low' : 'high',
      note: title_is_site_name
        ? SITE_NAME_NOTE
        : docSite ? `Site name "${docSite}" stripped from the <title> suffix.` : undefined,
    });
  }
  if (ogTitle && norm(ogTitle) !== norm(docPage)) {
    candidates.push({
      value: ogTitle, source: 'og_title',
      confidence: isSiteName(ogTitle) ? 'low' : 'high',
      note: isSiteName(ogTitle) ? SITE_NAME_NOTE : undefined,
    });
  }
  if (h1 && norm(h1) !== norm(docPage)) {
    candidates.push({
      value: h1,
      source: 'h1',
      confidence: h1_is_site_name ? 'low' : 'medium',
      note: h1_is_site_name ? SITE_NAME_NOTE : undefined,
    });
  }
  if (slug) {
    candidates.push({ value: titleCase(slug), source: 'url_slug', confidence: 'low' });
  }

  /**
   * Ranking, and why it is not simply "highest confidence wins".
   *
   * restagard.se ships <title>Resta Gård</title> on EVERY page and its first
   * <h1> is a shared FAQ heading. Confidence alone therefore names nine pages
   * after the farm — the same failure as before, arriving through a different
   * field. What distinguishes /hotell/ from /gris/ is the one thing the page
   * cannot fake: its own path. So a candidate that echoes the URL gets a bonus
   * worth slightly more than one confidence step — enough to rescue a degraded
   * page, never enough to override a good title two tiers up.
   */
  const tokens = slugTokens(url);
  const weight = (c: TitleCandidate) => {
    const tier = c.confidence === 'high' ? 3 : c.confidence === 'medium' ? 2 : 1;
    const echoesPath = tokens.some((t) => norm(c.value).includes(t));
    return tier + (echoesPath ? 1.5 : 0);
  };

  const best = [...candidates].sort((a, b) => weight(b) - weight(a))[0];
  return { candidates, recommended: best?.value || 'Untitled', h1_is_site_name, title_is_site_name };
}

// ---------------------------------------------------------------------------
// Routing check — "I read A page" is not "I read THIS page"
// ---------------------------------------------------------------------------

/**
 * The failure this catches, found live on restagard.se 2026-08-08:
 * every URL on the site returns the SAME 206 KB document. The router picks a
 * section client-side. A server-side reader therefore gets plenty of text —
 * high confidence by any length measure — and it is the wrong page's text.
 *
 * The shell detector cannot see this: there is no shell. So we check something
 * else entirely: does the document say anything about the path we asked for?
 * A page at /mjolk-mejeri/ that never mentions mjölk or mejeri, and whose title
 * is just the site name, is very likely not that page.
 *
 * This downgrades confidence and names the cause; it never blocks. A genuine
 * page whose vocabulary differs from its slug gets a warning it can survive.
 */
export function slugTokens(url: string): string[] {
  let path = '';
  try { path = decodeURIComponent(new URL(url).pathname); } catch { path = url; }
  return path.split(/[/\-_.]+/)
    .map((t) => t.toLowerCase().trim())
    .filter((t) => t.length >= 3 && !/^(html?|php|aspx?|index|www|se|com|sv|en)$/.test(t));
}

export function assessRouting(input: {
  url: string;
  documentTitle: string;
  siteName: string;
  headings: ObservedHeading[];
  text: string;
}): { path_reflected: boolean; reason: string } {
  const tokens = slugTokens(input.url);
  if (tokens.length === 0) {
    return { path_reflected: true, reason: 'Root URL — nothing to reflect.' };
  }

  const haystack = [
    input.documentTitle,
    ...input.headings.map((h) => h.text),
    input.text.slice(0, 1500),
  ].join(' ').toLowerCase();

  const hit = tokens.find((t) => haystack.includes(t));
  if (hit) {
    return { path_reflected: true, reason: `The page mentions "${hit}" from its own path.` };
  }

  const titleIsSiteName = !!input.siteName
    && input.documentTitle.toLowerCase().trim() === input.siteName.toLowerCase().trim();

  return {
    path_reflected: false,
    reason: titleIsSiteName
      ? `Nothing in this document mentions ${tokens.map((t) => `"${t}"`).join(' or ')}, and its title is just the site name. The server is very likely returning ONE shared document for every URL and routing client-side — so this is some other page's content, not ${input.url}.`
      : `Nothing in this document mentions ${tokens.map((t) => `"${t}"`).join(' or ')} from its own path. Either the page uses different words than its slug, or the server returned a different page.`,
  };
}

/** Cheap identity for the readable text, so a caller reading several pages can
 *  see for itself when two URLs came back with the same content. */
export function textFingerprint(text: string): string {
  const normalized = (text || '').replace(/\s+/g, ' ').trim().toLowerCase();
  let h = 5381;
  for (let i = 0; i < normalized.length; i++) h = ((h * 33) ^ normalized.charCodeAt(i)) >>> 0;
  return `${normalized.length}:${h.toString(36)}`;
}

// ---------------------------------------------------------------------------
// Images with a role hint
// ---------------------------------------------------------------------------

export type ImageRole = 'logo' | 'icon' | 'hero' | 'content';

export interface ObservedImage {
  src: string;
  alt?: string;
  width?: number;
  height?: number;
  role_hint: ImageRole;
  reason: string;
}

const LOGO_RE = /logo|brandmark|wordmark|sigill|seal|emblem|favicon/i;
const HERO_RE = /hero|banner|cover|masthead|jumbotron|header-image|slide/i;

/**
 * Choosing the hero by pixel area picked restagard.se's 1240x1240 logo seal.
 * Shape and naming say more than size: a square whose filename says "logo" is a
 * logo however many megapixels it has.
 */
export function classifyImage(
  src: string,
  alt: string | undefined,
  width: number | undefined,
  height: number | undefined,
  context: string,
): { role_hint: ImageRole; reason: string } {
  const haystack = `${src} ${alt || ''}`;

  if (LOGO_RE.test(haystack)) {
    return { role_hint: 'logo', reason: 'Filename or alt text names it a logo.' };
  }
  if (width && height && width <= 128 && height <= 128) {
    return { role_hint: 'icon', reason: `Small (${width}x${height}) — an icon, not page imagery.` };
  }
  if (width && height && width === height && width <= 1400 && LOGO_RE.test(context)) {
    return { role_hint: 'logo', reason: 'Square, and its surrounding markup names a logo.' };
  }
  if (HERO_RE.test(`${haystack} ${context}`)) {
    return { role_hint: 'hero', reason: 'Sits in hero/banner markup.' };
  }
  if (width && height && width >= 1200 && width > height * 1.3) {
    return { role_hint: 'hero', reason: `Wide (${width}x${height}) — landscape imagery, usable as a hero background.` };
  }
  return { role_hint: 'content', reason: 'In-page imagery.' };
}

/** Like extractImagesFromHtml, but keeps the dimensions and the neighbourhood. */
export function observeImages(html: string, baseUrl: string): ObservedImage[] {
  const out: ObservedImage[] = [];
  const seen = new Set<string>();
  const imgRe = /<img\b[^>]*>/gi;
  let m: RegExpExecArray | null;

  while ((m = imgRe.exec(html)) !== null) {
    const tag = m[0];
    const rawSrc = tag.match(/\b(?:data-src|data-lazy-src|srcset|src)=["']([^"'\s]+)/i)?.[1];
    if (!rawSrc || rawSrc.startsWith('data:')) continue;

    let src = rawSrc;
    try { src = new URL(rawSrc, baseUrl).toString(); } catch { /* keep as-is */ }
    if (seen.has(src)) continue;
    seen.add(src);

    const alt = tag.match(/\balt=["']([^"']*)["']/i)?.[1];
    const width = Number(tag.match(/\bwidth=["']?(\d+)/i)?.[1]) || undefined;
    const height = Number(tag.match(/\bheight=["']?(\d+)/i)?.[1]) || undefined;
    const context = html.slice(Math.max(0, m.index - 300), m.index + tag.length + 100);

    const { role_hint, reason } = classifyImage(src, alt, width, height, context);
    out.push({ src, alt, width, height, role_hint, reason });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Headings and readable sections
// ---------------------------------------------------------------------------

export interface ObservedHeading { level: number; text: string }

export function observeHeadings(html: string): ObservedHeading[] {
  const out: ObservedHeading[] = [];
  const re = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const text = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (text) out.push({ level: Number(m[1]), text });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Branding — null with a reason, never a silent {}
// ---------------------------------------------------------------------------

export function observeBranding(raw: FirecrawlBranding | null | undefined, strategy: RenderStrategy): {
  branding: ExtractedBranding | null;
  branding_reason: string;
} {
  if (!raw || Object.keys(raw).length === 0) {
    return {
      branding: null,
      branding_reason: strategy === 'firecrawl' || strategy === 'firecrawl-retry'
        ? 'The scraper returned no branding payload for this URL. Not the same as "the site has no brand" — read the colours off the page yourself if you need them.'
        : `Brand extraction needs the Firecrawl branding format; this page was read via ${strategy}, which is text-only.`,
    };
  }
  const extracted = extractBranding(raw);
  const empty = !extracted || Object.values(extracted).every((v) => v == null || v === '');
  if (empty) {
    return { branding: null, branding_reason: 'A branding payload came back but every field was empty.' };
  }
  return { branding: extracted, branding_reason: 'Extracted from the scraper branding payload.' };
}

// ---------------------------------------------------------------------------
// The observation envelopes
// ---------------------------------------------------------------------------

/** Every sensor response carries this so no caller mistakes it for a page. */
export const SENSOR_CONTRACT =
  'This is an OBSERVATION, not a page. It contains no blocks and wrote nothing. ' +
  'You compose: call describe_blocks for the field contracts, then manage_page ' +
  '(action=create) and create_page_block. Decide the hero, the sections and the ' +
  'calls to action yourself — the source page has no such elements to copy.';

export interface PageObservation {
  action: 'read';
  url: string;
  render: RenderReport;
  title: { recommended: string; candidates: TitleCandidate[]; h1_is_site_name: boolean; title_is_site_name: boolean };
  meta: { description?: string; og_image?: string; lang?: string };
  platform: string;
  routing: { path_reflected: boolean; reason: string };
  headings: ObservedHeading[];
  text_markdown: string;
  text_fingerprint: string;
  images: ObservedImage[];
  image_summary: Record<ImageRole, number>;
  videos: unknown[];
  branding: ExtractedBranding | null;
  branding_reason: string;
  _contract: string;
  _next: string;
}

export function buildPageObservation(input: {
  url: string;
  html: string;
  markdown: string;
  metadata: Record<string, unknown>;
  platform: string;
  strategy: RenderStrategy;
  rawBranding?: FirecrawlBranding | null;
  videos?: unknown[];
  siteName?: string;
}): PageObservation {
  const { url, html, markdown, metadata, platform, strategy } = input;
  const render = assessRender(html, markdown, strategy);
  const title = titleCandidates(html, metadata.title as string | undefined, url, input.siteName);
  const images = observeImages(html, url);
  const headings = observeHeadings(html);
  const { branding, branding_reason } = observeBranding(input.rawBranding, strategy);

  const routing = assessRouting({
    url,
    documentTitle: html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, ' ').trim() || '',
    siteName: input.siteName || siteNameFrom(html, url),
    headings,
    text: markdown || '',
  });

  // Plenty of text from the wrong page still reads as "high" by any length
  // measure. Confidence has to account for identity, not only volume.
  if (!routing.path_reflected && render.confidence === 'high') {
    render.confidence = 'partial';
    render.reason = `${render.reason} BUT: ${routing.reason}`;
    render.suggestion = 'Verify against the live URL before composing — re-read it through a browser (relay_result / browser_fetch force_relay=true), which follows client-side routing.';
  }

  const image_summary: Record<ImageRole, number> = { logo: 0, icon: 0, hero: 0, content: 0 };
  for (const img of images) image_summary[img.role_hint]++;

  return {
    action: 'read',
    url,
    render,
    routing,
    title: {
      recommended: title.recommended, candidates: title.candidates,
      h1_is_site_name: title.h1_is_site_name, title_is_site_name: title.title_is_site_name,
    },
    meta: {
      description: (metadata.description as string) || html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1],
      og_image: html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1],
      lang: html.match(/<html[^>]+lang=["']([^"']+)["']/i)?.[1],
    },
    platform,
    headings,
    text_markdown: markdown || '',
    text_fingerprint: textFingerprint(markdown || ''),
    images,
    image_summary,
    videos: input.videos ?? [],
    branding,
    branding_reason,
    _contract: SENSOR_CONTRACT,
    _next: render.confidence === 'shell'
      ? 'Do NOT compose from this. Re-read the URL through a browser first — see render.suggestion.'
      : !routing.path_reflected
        ? 'Check routing.reason before composing — this may be another page\'s content. Comparing text_fingerprint across two URLs settles it: identical fingerprints mean the server served one document for both.'
        : 'describe_blocks → manage_page(action=create) → create_page_block, using title.recommended and the text below.',
  };
}

export interface SurveyPage {
  url: string;
  title: string;
  type: 'page' | 'blog' | 'kb';
  source: 'nav' | 'sitemap';
}

export interface SiteSurvey {
  action: 'survey';
  base_url: string;
  site_name: string;
  platform: string;
  render: RenderReport;
  page_count: number;
  pages: SurveyPage[];
  navigation: { label: string; url: string }[];
  has_blog: boolean;
  has_knowledge_base: boolean;
  branding: ExtractedBranding | null;
  branding_reason: string;
  _contract: string;
  _next: string;
}

export function buildSiteSurvey(input: {
  baseUrl: string;
  siteName: string;
  platform: string;
  html: string;
  markdown: string;
  strategy: RenderStrategy;
  pages: SurveyPage[];
  navigation: { label: string; url: string }[];
  rawBranding?: FirecrawlBranding | null;
}): SiteSurvey {
  const render = assessRender(input.html, input.markdown, input.strategy);
  const { branding, branding_reason } = observeBranding(input.rawBranding, input.strategy);
  return {
    action: 'survey',
    base_url: input.baseUrl,
    site_name: input.siteName,
    platform: input.platform,
    render,
    page_count: input.pages.length,
    pages: input.pages,
    navigation: input.navigation,
    has_blog: input.pages.some((p) => p.type === 'blog'),
    has_knowledge_base: input.pages.some((p) => p.type === 'kb'),
    branding,
    branding_reason,
    _contract: SENSOR_CONTRACT,
    _next: 'Pick the pages worth keeping — a survey is an inventory, not a plan. ' +
      'Then call migrate_url(action="read", url=…, site_name="' + input.siteName + '") per page ' +
      'and compose each one yourself. Passing site_name matters: sites that put the company name ' +
      'in every page\'s <title> would otherwise name every page after the company.',
  };
}
