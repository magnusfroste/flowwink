import { ImageResponse } from '@vercel/og';
import { ogCardModel, firstBlockPicture, type OgCardModel, type OgBranding } from '../src/lib/og-card';

/**
 * Edge runtime: @vercel/og is built for it (the wasm it needs is inlined in
 * its edge build). As a Node function on Vercel the first invocation died
 * with FUNCTION_INVOCATION_FAILED before any of our code ran — the wasm
 * files were not in the traced bundle (synclair, 2026-10-21).
 */
export const config = { runtime: 'edge' };

/**
 * /api/og?path=/isr — the DERIVED social card, rendered from the site's
 * branding and the page's own title, description and picture. The shell
 * (api/html.ts) points og:image here when neither the page nor the site set
 * one. Model and precedence live in src/lib/og-card.ts; this file is only
 * the renderer (Satori via @vercel/og, Inter bundled).
 */
type Row = Record<string, unknown>;
async function pg(base: string, key: string, q: string): Promise<Row[]> {
  try {
    const res = await fetch(`${base}/rest/v1/${q}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/**
 * The brand's heading font, as bytes, for Satori. @vercel/og bundles only a
 * regular Noto Sans, so a 700 title would render regular — the card has to
 * carry the brand font itself. Google Fonts' css2 endpoint answers a plain
 * fetch (no browser User-Agent) with TTF URLs, which Satori reads; one fetch
 * per family/weight per isolate. Unreachable → the bundled default, still a
 * card.
 */
const fontCache = new Map<string, Promise<ArrayBuffer | null>>();
function googleFont(family: string, weight: 400 | 700): Promise<ArrayBuffer | null> {
  const k = `${family}:${weight}`;
  if (!fontCache.has(k)) {
    fontCache.set(k, (async () => {
      try {
        const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}&display=swap`)).text();
        const url = css.match(/src: url\(([^)]+)\) format\('(?:truetype|opentype)'\)/)?.[1];
        if (!url) return null;
        const res = await fetch(url);
        return res.ok ? await res.arrayBuffer() : null;
      } catch { return null; }
    })());
  }
  return fontCache.get(k)!;
}

type El = { type: string; props: Record<string, unknown> };
// Satori: every box with more than one child must declare display:flex, so
// every div here does; null children are dropped before they are counted.
const h = (type: string, props: Record<string, unknown>, ...children: unknown[]): El => {
  const kids = children.filter((c) => c !== null && c !== undefined && c !== false);
  const style = type === 'div' ? { display: 'flex', ...((props.style as Record<string, unknown>) || {}) } : props.style;
  return { type, props: { ...props, ...(style ? { style } : {}), children: kids.length === 1 ? kids[0] : kids } };
};

export function card(m: OgCardModel): El {
  const textCol = h('div', { style: { display: 'flex', flexDirection: 'column', justifyContent: 'center', width: m.picture ? 600 : 1140, height: 630, padding: '56px 0 56px 60px' } },
    m.logo ? h('img', { src: m.logo, height: 44, style: { objectFit: 'contain', objectPosition: 'left', marginBottom: 36 } }) : h('div', { style: { height: 44, marginBottom: 36 } }),
    m.eyebrow ? h('div', { style: { color: m.accent, fontSize: 18, fontWeight: 700, letterSpacing: 6, textTransform: 'uppercase', marginBottom: 18 } }, m.eyebrow) : null,
    h('div', { style: { display: 'flex', flexDirection: 'column', color: m.foreground, fontSize: m.titleSize, fontWeight: 700, lineHeight: 1.05, letterSpacing: -1 } },
      ...m.titleLines.map((l) => h('div', {}, l))),
    m.description ? h('div', { style: { color: m.muted, fontSize: 24, lineHeight: 1.35, marginTop: 24, maxWidth: m.picture ? 500 : 900 } }, m.description) : null,
  );
  const picture = m.picture
    ? h('div', { style: { position: 'absolute', left: 600, top: 0, width: 600, height: 630, display: 'flex' } },
        h('img', { src: m.picture, width: 600, height: 630, style: { objectFit: 'cover' } }),
        h('div', { style: { position: 'absolute', left: 0, top: 0, width: 600, height: 630, backgroundImage: `linear-gradient(to right, ${m.ground} 0%, ${m.ground} 10%, rgba(0,0,0,0) 55%)` } }),
      )
    : null;
  const band = h('div', { style: { position: 'absolute', left: 0, bottom: 0, width: 1200, height: 10, backgroundImage: `linear-gradient(to right, ${m.primary}, ${m.accent})` } });
  return h('div', { style: { display: 'flex', width: 1200, height: 630, background: m.ground, position: 'relative', fontFamily: 'Brand, sans-serif' } }, textCol, picture, band);
}

export default async function handler(req: Request): Promise<Response> {
  try {
    return await render(req);
  } catch (e) {
    // A card that cannot be drawn answers with WHY, as text, never a crash
    // page: the shell's og:image then simply fails to load, and the reason
    // is one curl away.
    return new Response(`og card failed: ${e instanceof Error ? e.message : String(e)}`, { status: 500, headers: { 'content-type': 'text/plain; charset=utf-8', 'x-flowwink-og': 'error', 'cache-control': 'no-store' } });
  }
}

async function render(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = (url.searchParams.get('path') || '/').replace(/\/+$/, '') || '/';
  const base = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '';
  let title = 'Website'; let siteName = ''; let description = ''; let picture: string | null = null; let branding: (OgBranding & Row) | null = null; let eyebrow = '';
  const str = (v: unknown): string => (typeof v === 'string' ? v : '');
  if (base && key) {
    const settings = await pg(base, key, 'site_settings?key=in.(seo,general,branding)&select=key,value');
    const byKey: Record<string, Row> = {};
    for (const row of settings) byKey[str(row.key)] = (row.value as Row) || {};
    const seo = byKey.seo || {}; branding = (byKey.branding || {}) as OgBranding & Row;
    siteName = str(seo.siteTitle) || str(branding.organizationName);
    title = siteName || title; description = str(seo.defaultDescription) || str(branding.brandTagline);
    const homepageSlug = str((byKey.general || {}).homepageSlug) || 'home';
    const slug = path === '/' ? homepageSlug : decodeURIComponent(path.replace(/^\//, '').split('/').pop() || homepageSlug);
    const [page] = await pg(base, key, `pages?slug=eq.${encodeURIComponent(slug)}&status=eq.published&select=slug,title,meta_json,content_json&limit=1`);
    if (page) {
      const m = (page.meta_json || {}) as Row;
      title = str(m.seoTitle).trim() || str(page.title) || title;
      description = str(m.description) || str(m.seoDescription) || description;
      // A block's photo first: a page's og_image may itself be a finished card, and a card inside a card is not a picture.
      picture = firstBlockPicture(page.content_json) || str(m.og_image) || str(m.ogImage) || null;
      eyebrow = siteName;
    }
  }
  const model = ogCardModel({ title, description, siteName, eyebrow, picture, branding });
  const family = (branding && (str(branding.headingFont) || str(branding.bodyFont))) || 'Inter';
  const [bold, regular] = await Promise.all([googleFont(family, 700), googleFont(family, 400)]);
  const fonts = [bold && { name: 'Brand', data: bold, weight: 700 as const, style: 'normal' as const }, regular && { name: 'Brand', data: regular, weight: 400 as const, style: 'normal' as const }].filter(Boolean) as { name: string; data: ArrayBuffer; weight: 400 | 700; style: 'normal' }[];
  return new ImageResponse(card(model) as unknown as ConstructorParameters<typeof ImageResponse>[0], {
    width: 1200, height: 630,
    ...(fonts.length ? { fonts } : {}),
    headers: { 'cache-control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400', 'x-flowwink-og': 'derived' },
  });
}
