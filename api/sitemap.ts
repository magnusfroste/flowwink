export const config = { runtime: 'edge' };

declare const process: { env: Record<string, string | undefined> };

const EMPTY =
  '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>';

/**
 * Dynamic sitemap.xml.
 *
 * Served at `/sitemap.xml` on the customer's OWN Vercel domain (see vercel.json).
 * It proxies this instance's Supabase `sitemap` edge function, passing
 * `base_url = <this request's host>` — so every `<loc>` in the sitemap is the
 * customer's domain, not a hardcoded one. The Supabase URL + anon key come from
 * the same env the Vite build already uses (no new configuration needed).
 */
export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const host = req.headers.get('host') || url.host;
  const proto = req.headers.get('x-forwarded-proto') || 'https';
  const origin = `${proto}://${host}`;

  const supabaseUrl = (
    process.env.VITE_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    ''
  ).replace(/\/+$/, '');
  const anonKey =
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    '';

  if (!supabaseUrl) {
    return new Response(EMPTY, {
      headers: { 'content-type': 'application/xml; charset=utf-8' },
    });
  }

  const fnUrl = `${supabaseUrl}/functions/v1/sitemap?base_url=${encodeURIComponent(origin)}`;
  try {
    const r = await fetch(fnUrl, {
      headers: anonKey ? { apikey: anonKey, authorization: `Bearer ${anonKey}` } : {},
    });
    const xml = await r.text();
    return new Response(xml, {
      headers: {
        'content-type': 'application/xml; charset=utf-8',
        'cache-control': 'public, max-age=3600',
      },
    });
  } catch {
    return new Response(EMPTY, {
      headers: { 'content-type': 'application/xml; charset=utf-8' },
    });
  }
}
