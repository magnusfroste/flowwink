export const config = { runtime: 'edge' };

/**
 * The feedback endpoint of this site: POST /api/feedback (a post) and
 * POST /api/feedback/ping (the daily ping) from other instances, forwarded to
 * this instance's content-api with the anon key. An instance's site URL is what
 * an operator types into "feedback endpoint" (https://www.flowwink.com); the
 * Supabase functions URL behind it is this file's business.
 */
declare const process: { env: Record<string, string | undefined> };

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST a feedback post here, or a ping at /api/feedback/ping.' }), {
      status: 405, headers: { 'Content-Type': 'application/json', Allow: 'POST' },
    });
  }
  const base = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '';
  if (!base || !key) {
    return new Response(JSON.stringify({ error: 'This site has no backend configured for feedback.' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
  }
  const url = new URL(req.url);
  const sub = (url.searchParams.get('sub') || url.pathname.replace(/^\/api\/feedback\/?/, '')).replace(/^\/+|\/+$/g, '');
  if (sub && sub !== 'ping') {
    return new Response(JSON.stringify({ error: 'Unknown feedback route.' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  }
  const target = `${base}/functions/v1/content-api/feedback${sub ? `/${sub}` : ''}`;
  const body = await req.text();
  const upstream = await fetch(target, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, apikey: key },
    body,
  });
  const text = await upstream.text();
  return new Response(text, { status: upstream.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
