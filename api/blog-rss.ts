export const config = { runtime: 'edge' };

declare const process: { env: Record<string, string | undefined> };

/**
 * The blog's RSS feed, at /api/blog-rss on the customer's OWN domain — the
 * address the blog archive's RSS button and the feed's own atom:link name
 * (?lang=sv for a language's feed). It proxies this instance's `blog-rss`
 * edge function with `base_url = <this request's host>`, as api/sitemap.ts
 * does, so every <link> is the site's address and not the functions host.
 * Before this file the button opened the app shell (2026-10-30).
 */
export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const host = req.headers.get('host') || url.host;
  const proto = req.headers.get('x-forwarded-proto') || 'https';
  const origin = `${proto}://${host}`;

  const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const anonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '';
  if (!supabaseUrl) {
    return new Response('This site has no backend configured for its feed.', { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  }

  const target = new URL(`${supabaseUrl}/functions/v1/blog-rss`);
  target.searchParams.set('base_url', origin);
  const lang = url.searchParams.get('lang');
  if (lang) target.searchParams.set('lang', lang);

  try {
    const r = await fetch(target, { headers: anonKey ? { apikey: anonKey, authorization: `Bearer ${anonKey}` } : {} });
    const body = await r.text();
    return new Response(body, {
      status: r.status,
      headers: {
        'content-type': r.headers.get('content-type') || 'application/rss+xml; charset=utf-8',
        'cache-control': r.ok ? 'public, max-age=3600' : 'no-store',
      },
    });
  } catch {
    return new Response('The feed could not be reached.', { status: 502, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
  }
}
