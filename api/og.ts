/* eslint-disable @typescript-eslint/no-explicit-any -- prerender reads dynamic, loosely-typed PostgREST JSON */
export const config = { runtime: 'edge' };

declare const process: { env: Record<string, string | undefined> };

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function pg(base: string, key: string, query: string): Promise<any[]> {
  try {
    const r = await fetch(`${base}/rest/v1/${query}`, {
      headers: { apikey: key, authorization: `Bearer ${key}` },
    });
    if (!r.ok) return [];
    return (await r.json()) as any[];
  } catch {
    return [];
  }
}

/**
 * Crawler prerender for social-share cards.
 *
 * Vercel rewrites route ONLY requests whose User-Agent matches a social crawler
 * (facebookexternalhit, Twitterbot, LinkedInBot, Slackbot, Discordbot, WhatsApp,
 * …) here — see vercel.json. Real users and JS-rendering search engines
 * (Googlebot/bingbot) are never routed here; they get the SPA, whose meta comes
 * from react-helmet. This returns a tiny HTML doc carrying the CUSTOMER's
 * OG/Twitter meta (their title, description, image, and own domain) for the
 * requested page — so every social share is 100% their brand, never FlowWink's.
 *
 * Identity comes from the same Supabase the Vite build already points at
 * (site_settings key='seo' + per-page blog_posts/pages) — no new configuration.
 */
export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = (url.searchParams.get('path') || '/').replace(/\/+$/, '') || '/';
  const host = req.headers.get('host') || url.host;
  const proto = req.headers.get('x-forwarded-proto') || 'https';
  const origin = `${proto}://${host}`;
  const pageUrl = path === '/' ? origin : `${origin}${path}`;

  const base = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '';

  let title = 'Website';
  let siteName = '';
  let description = '';
  let image = '';
  let twitter = '';
  let titleTemplate = '%s';
  let isArticle = false;

  if (base && key) {
    const settings = await pg(base, key, 'site_settings?key=in.(seo,general)&select=key,value');
    const byKey: Record<string, any> = {};
    for (const row of settings) byKey[row.key] = row.value || {};
    const seo = byKey.seo || {};
    title = seo.siteTitle || 'Website';
    siteName = seo.siteTitle || title;
    description = seo.defaultDescription || '';
    image = seo.ogImage || '';
    twitter = seo.twitterHandle || '';
    titleTemplate = seo.titleTemplate || '%s';

    const blog = path.match(/^\/blog\/(.+)$/);
    if (blog) {
      isArticle = true;
      const slug = encodeURIComponent(decodeURIComponent(blog[1]));
      const [post] = await pg(
        base,
        key,
        `blog_posts?slug=eq.${slug}&status=eq.published&select=title,excerpt,featured_image&limit=1`,
      );
      if (post) {
        if (post.title) title = post.title;
        if (post.excerpt) description = post.excerpt;
        if (post.featured_image) image = post.featured_image;
      }
    } else if (path !== '/') {
      const slug = encodeURIComponent(decodeURIComponent(path.replace(/^\//, '')));
      const [page] = await pg(
        base,
        key,
        `pages?slug=eq.${slug}&status=eq.published&select=title,meta_json&limit=1`,
      );
      if (page) {
        if (page.title) title = page.title;
        const m = (page.meta_json || {}) as Record<string, unknown>;
        description = (m.description as string) || (m.seoDescription as string) || (m.metaDescription as string) || description;
        image = (m.ogImage as string) || (m.og_image as string) || (m.image as string) || image;
      }
    }
  }

  const fullTitle = title === siteName ? title : titleTemplate.replace('%s', title);

  const tags = [
    `<title>${esc(fullTitle)}</title>`,
    description && `<meta name="description" content="${esc(description)}">`,
    `<meta property="og:type" content="${isArticle ? 'article' : 'website'}">`,
    `<meta property="og:title" content="${esc(fullTitle)}">`,
    description && `<meta property="og:description" content="${esc(description)}">`,
    `<meta property="og:url" content="${esc(pageUrl)}">`,
    siteName && `<meta property="og:site_name" content="${esc(siteName)}">`,
    image && `<meta property="og:image" content="${esc(image)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(fullTitle)}">`,
    description && `<meta name="twitter:description" content="${esc(description)}">`,
    image && `<meta name="twitter:image" content="${esc(image)}">`,
    twitter && `<meta name="twitter:site" content="${esc(twitter)}">`,
    `<link rel="canonical" href="${esc(pageUrl)}">`,
  ]
    .filter(Boolean)
    .join('\n    ');

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    ${tags}
  </head>
  <body>
    <h1>${esc(fullTitle)}</h1>
    ${description ? `<p>${esc(description)}</p>` : ''}
    <p><a href="${esc(pageUrl)}">${esc(pageUrl)}</a></p>
  </body>
</html>`;

  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=300, s-maxage=300',
    },
  });
}
