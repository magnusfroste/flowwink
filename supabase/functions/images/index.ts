// Images — unified fetch, process, and Unsplash search
// Actions: fetch, process, unsplash
import { getServiceClient } from '../_shared/supabase-clients.ts';

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };

async function fetchAsBase64(imageUrl: string): Promise<{ base64: string; contentType: string; size: number }> {
  const res = await fetch(imageUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CMSBot/1.0)', 'Accept': 'image/*' } });
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
  const ct = res.headers.get('content-type') || 'image/jpeg';
  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, Math.min(i + 8192, bytes.length))));
  return { base64: btoa(binary), contentType: ct, size: bytes.length };
}

// ─── Action: fetch ──────────────────────────────────────────────────────────
async function handleFetch(req: Request): Promise<Response> {
  const { imageUrl } = await req.json();
  if (!imageUrl) return new Response(JSON.stringify({ success: false, error: 'imageUrl is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  const result = await fetchAsBase64(imageUrl);
  return new Response(JSON.stringify({ success: true, ...result }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

// ─── Action: process ────────────────────────────────────────────────────────
async function handleProcess(req: Request): Promise<Response> {
  const { imageUrl, fileName, folder = 'imports' } = await req.json();
  if (!imageUrl) return new Response(JSON.stringify({ success: false, error: 'imageUrl krävs' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  const res = await fetch(imageUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CMSBot/1.0)' } });
  if (!res.ok) throw new Error(`Kunde inte hämta bilden: ${res.status}`);
  const ct = res.headers.get('content-type') || '';
  if (!ct.startsWith('image/')) throw new Error('URL:en pekar inte på en bild');
  const buf = await res.arrayBuffer();
  const supabase = getServiceClient();
  const safeFolder = (folder || 'imports').replace(/[^a-zA-Z0-9-_]/g, '');
  const baseName = fileName ? fileName.replace(/\.[^/.]+$/, '') : `image-${Math.random().toString(36).substring(7)}`;
  const ext = ct.split('/')[1]?.split(';')[0] || 'jpg';
  const path = `${safeFolder}/${Date.now()}-${baseName}.${ext}`;
  const { error: uploadError } = await supabase.storage.from('cms-images').upload(path, buf, { contentType: ct, upsert: false });
  if (uploadError) throw new Error(`Uppladdning misslyckades: ${uploadError.message}`);
  const { data: { publicUrl } } = supabase.storage.from('cms-images').getPublicUrl(path);
  return new Response(JSON.stringify({ success: true, url: publicUrl, originalUrl: imageUrl, fileName: path }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

// ─── Action: unsplash ───────────────────────────────────────────────────────
async function handleUnsplash(req: Request): Promise<Response> {
  const accessKey = Deno.env.get('UNSPLASH_ACCESS_KEY');
  if (!accessKey) return new Response(JSON.stringify({ error: 'Unsplash API key not configured' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  const { query, page = 1, perPage = 20 } = await req.json();
  if (!query || typeof query !== 'string') return new Response(JSON.stringify({ error: 'Query parameter is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  const url = new URL('https://api.unsplash.com/search/photos');
  url.searchParams.set('query', query); url.searchParams.set('page', String(page)); url.searchParams.set('per_page', String(perPage)); url.searchParams.set('orientation', 'landscape');
  const res = await fetch(url.toString(), { headers: { 'Authorization': `Client-ID ${accessKey}`, 'Accept-Version': 'v1' } });
  if (!res.ok) return new Response(JSON.stringify({ error: 'Failed to search Unsplash', details: await res.text() }), { status: res.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  const data = await res.json();
  const photos = data.results.map((p: any) => ({ id: p.id, url: p.urls.regular, thumbUrl: p.urls.small, alt: p.alt_description || p.description || 'Unsplash photo', photographer: p.user.name, photographerUrl: `https://unsplash.com/@${p.user.username}?utm_source=cms&utm_medium=referral`, width: p.width, height: p.height }));
  return new Response(JSON.stringify({ photos, total: data.total, totalPages: data.total_pages, page }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

// ─── Router ──────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    let action = url.searchParams.get('action');
    if (!action) { try { action = (await req.json()).action; } catch { /* */ } }
    switch (action) {
      case 'fetch': return await handleFetch(req);
      case 'process': return await handleProcess(req);
      case 'unsplash': return await handleUnsplash(req);
      default: return new Response(JSON.stringify({ error: 'Unknown action. Use: fetch, process, unsplash' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
  } catch (e) { return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); }
});
