export const config = { runtime: 'edge' };

declare const process: { env: Record<string, string | undefined> };

/**
 * /llms.txt och /llms-full.txt — AEO-ytan för svarsmotorer.
 *
 * Edge-funktionen `llms-txt` har funnits länge, men vercel.json saknade
 * route: båda vägarna föll igenom till SPA-skalets index.html, så varje
 * instans serverade HTML där svarsmotorer väntade sig text — och
 * llmsTxtEnabled-ratten gjorde ingenting (upptäckt på Restagård
 * 2026-08-28). Samma proxy-mönster som api/sitemap.ts; funktionen väljer
 * full-varianten på pathname, så vi speglar inkommande path.
 */
export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const host = req.headers.get('host') || url.host;
  const proto = req.headers.get('x-forwarded-proto') || 'https';
  const origin = `${proto}://${host}`;
  const isFull = url.pathname.includes('llms-full') || url.searchParams.get('variant') === 'full';

  const supabaseUrl = (
    process.env.VITE_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    ''
  ).replace(/\/+$/, '');
  const anonKey =
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    '';

  const empty = () =>
    new Response('# llms.txt\n', {
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });

  if (!supabaseUrl) return empty();

  const fnPath = isFull ? 'llms-txt/llms-full.txt' : 'llms-txt';
  const fnUrl = `${supabaseUrl}/functions/v1/${fnPath}?base_url=${encodeURIComponent(origin)}`;
  try {
    const r = await fetch(fnUrl, {
      headers: anonKey ? { apikey: anonKey, authorization: `Bearer ${anonKey}` } : {},
    });
    const text = await r.text();
    return new Response(text, {
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'public, max-age=3600',
      },
    });
  } catch {
    return empty();
  }
}
