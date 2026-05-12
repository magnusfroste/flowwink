// Web Tools — unified search + scrape via action routing
// Actions: search, scrape
import { getServiceClient } from '../_shared/supabase-clients.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

async function getIntegrationConfig(): Promise<{ preferFreeTier: boolean; firecrawlEnabled: boolean }> {
  try {
    const sb = getServiceClient();
    const { data } = await sb.from('site_settings').select('value').eq('key', 'integrations').maybeSingle();
    const jina = data?.value?.jina;
    const firecrawl = data?.value?.firecrawl;
    return { preferFreeTier: jina?.config?.preferFreeTier ?? true, firecrawlEnabled: firecrawl?.enabled !== false };
  } catch { return { preferFreeTier: true, firecrawlEnabled: true }; }
}

// ─── Search ──────────────────────────────────────────────────────────────────
interface SearchResult { title: string; url: string; description: string; content?: string; }

async function jinaSearch(query: string, limit: number, apiKey?: string): Promise<{ results: SearchResult[], ok: boolean }> {
  const headers: Record<string, string> = { 'Accept': 'application/json' };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
  try {
    const res = await fetch(`https://s.jina.ai/${encodeURIComponent(query)}`, { headers });
    if (res.ok) {
      const data = await res.json();
      return { results: (data.data || []).slice(0, limit).map((r: any) => ({ title: r.title || '', url: r.url || '', description: r.description || '' })), ok: true };
    }
    return { results: [], ok: false };
  } catch { return { results: [], ok: false }; }
}

async function handleSearch(req: Request): Promise<Response> {
  const { query, limit = 5, lang, country, preferred_provider = 'auto' } = await req.json();
  if (!query) return new Response(JSON.stringify({ success: false, error: 'query is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY');
  const jinaKey = Deno.env.get('JINA_API_KEY');
  let results: SearchResult[] = [];
  let provider = 'none';
  const config = await getIntegrationConfig();
  const firecrawlAvailable = firecrawlKey && config.firecrawlEnabled;
  const useFirecrawl = preferred_provider === 'firecrawl' || (preferred_provider === 'auto' && firecrawlAvailable);
  const useJina = preferred_provider === 'jina' || preferred_provider === 'auto';

  if (useFirecrawl && firecrawlKey) {
    try {
      const res = await fetch('https://api.firecrawl.dev/v1/search', {
        method: 'POST', headers: { 'Authorization': `Bearer ${firecrawlKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, limit, lang: lang || undefined, country: country || undefined }),
      });
      if (res.ok) {
        const data = await res.json();
        results = (data.data || []).map((r: any) => ({ title: r.title || '', url: r.url || '', description: r.description || '', content: r.markdown || r.content || undefined }));
        provider = 'firecrawl';
      }
    } catch (e) { console.warn('[web-tools] Firecrawl search error:', e); }
  }

  if (results.length === 0 && useJina) {
    if (config.preferFreeTier) {
      const keyless = await jinaSearch(query, limit);
      if (keyless.ok && keyless.results.length > 0) { results = keyless.results; provider = 'jina-free'; }
      else if (jinaKey) { const authed = await jinaSearch(query, limit, jinaKey); if (authed.ok) { results = authed.results; provider = 'jina-api'; } }
    } else if (jinaKey) { const authed = await jinaSearch(query, limit, jinaKey); if (authed.ok) { results = authed.results; provider = 'jina-api'; } }
    else { const keyless = await jinaSearch(query, limit); if (keyless.ok) { results = keyless.results; provider = 'jina-free'; } }
  }

  return new Response(JSON.stringify({ success: true, provider, results, query }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

// ─── Scrape ──────────────────────────────────────────────────────────────────
async function jinaReader(url: string, maxLength: number, apiKey?: string): Promise<{ content: string, metadata: Record<string, unknown>, ok: boolean }> {
  const headers: Record<string, string> = { 'Accept': 'application/json' };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
  try {
    const res = await fetch(`https://r.jina.ai/${url}`, { headers });
    if (res.ok) {
      const data = await res.json();
      return { content: (data.data?.content || '').substring(0, maxLength), metadata: { title: data.data?.title, url: data.data?.url }, ok: true };
    }
    return { content: '', metadata: {}, ok: false };
  } catch { return { content: '', metadata: {}, ok: false }; }
}

async function handleScrape(req: Request): Promise<Response> {
  const { url, max_length = 10000, formats = ['markdown'], preferred_provider = 'auto' } = await req.json();
  if (!url) return new Response(JSON.stringify({ success: false, error: 'url is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY');
  const jinaKey = Deno.env.get('JINA_API_KEY');
  let content = '';
  let metadata: Record<string, unknown> = {};
  let provider = 'none';
  const config = await getIntegrationConfig();
  const firecrawlAvailable = firecrawlKey && config.firecrawlEnabled;
  const useFirecrawl = preferred_provider === 'firecrawl' || (preferred_provider === 'auto' && firecrawlAvailable);
  const useJina = preferred_provider === 'jina' || preferred_provider === 'auto';

  if (useFirecrawl && firecrawlKey) {
    try {
      const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST', headers: { 'Authorization': `Bearer ${firecrawlKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, formats, onlyMainContent: true }),
      });
      if (res.ok) {
        const data = await res.json();
        content = (data.data?.markdown || data.markdown || '').substring(0, max_length);
        metadata = data.data?.metadata || data.metadata || {};
        provider = 'firecrawl';
      }
    } catch (e) { console.warn('[web-tools] Firecrawl scrape error:', e); }
  }

  if (!content && useJina) {
    if (config.preferFreeTier) {
      const keyless = await jinaReader(url, max_length);
      if (keyless.ok && keyless.content) { content = keyless.content; metadata = keyless.metadata; provider = 'jina-free'; }
      else if (jinaKey) { const authed = await jinaReader(url, max_length, jinaKey); if (authed.ok) { content = authed.content; metadata = authed.metadata; provider = 'jina-api'; } }
    } else if (jinaKey) { const authed = await jinaReader(url, max_length, jinaKey); if (authed.ok) { content = authed.content; metadata = authed.metadata; provider = 'jina-api'; } }
    else { const keyless = await jinaReader(url, max_length); if (keyless.ok) { content = keyless.content; metadata = keyless.metadata; provider = 'jina-free'; } }
  }

  return new Response(JSON.stringify({ success: !!content, provider, content, metadata, url }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

// ─── Router ──────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    let action = url.searchParams.get('action');
    // Also accept action from body for supabase.functions.invoke() callers
    if (!action) {
      try {
        const body = await req.json();
        action = body.action || null;
      } catch { /* not JSON or no action */ }
    }
    switch (action) {
      case 'search': return await handleSearch(req);
      case 'scrape': return await handleScrape(req);
      default: return new Response(JSON.stringify({ error: 'Unknown action. Use: search, scrape' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
