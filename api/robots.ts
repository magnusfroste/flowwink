export const config = { runtime: 'edge' };

/**
 * Dynamic robots.txt.
 *
 * Served at `/robots.txt` on the customer's OWN Vercel domain (see the rewrite in
 * vercel.json). It advertises this deployment's own host for the Sitemap, so every
 * self-hosted instance is indexed under its own brand — never a hardcoded
 * flowwink domain. Replaces the old static public/robots.txt.
 */
export default function handler(req: Request): Response {
  const url = new URL(req.url);
  const host = req.headers.get('host') || url.host;
  const proto = req.headers.get('x-forwarded-proto') || 'https';
  const origin = `${proto}://${host}`;

  const body = [
    'User-agent: Googlebot',
    'Allow: /',
    '',
    'User-agent: Bingbot',
    'Allow: /',
    '',
    'User-agent: Twitterbot',
    'Allow: /',
    '',
    'User-agent: facebookexternalhit',
    'Allow: /',
    '',
    'User-agent: *',
    'Allow: /',
    '',
    `Sitemap: ${origin}/sitemap.xml`,
    '',
  ].join('\n');

  return new Response(body, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
}
