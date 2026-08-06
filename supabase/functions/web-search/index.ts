import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getServiceClient } from '../_shared/supabase-clients.ts';

/**
 * Web Search — Modular integration skill
 * 
 * Searches the web for information about a query.
 * Provider priority: Firecrawl (if key available) → Jina Search
 * Jina: free tier first (if preferFreeTier), then API key, then keyless fallback
 * 
 * Used by: prospect-research orchestrator, FlowPilot directly, content research
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface WebSearchInput {
  query: string;
  limit?: number;
  lang?: string;
  country?: string;
  preferred_provider?: 'firecrawl' | 'jina' | 'searxng' | 'auto';
}

interface SearchResult {
  title: string;
  url: string;
  description: string;
  content?: string;
}

async function getIntegrationConfig(): Promise<{
  preferFreeTier: boolean;
  firecrawlEnabled: boolean;
  searxngEnabled: boolean;
  searxngUrl: string | null;
  /** Provider keys ordered by admin-configured priority (1 = first). */
  providerOrder: Array<'firecrawl' | 'searxng' | 'jina'>;
}> {
  const DEFAULT_PRIORITY = { searxng: 1, firecrawl: 2, jina: 3 } as const;
  try {
    const sb = getServiceClient();
    const { data } = await sb
      .from('site_settings')
      .select('value')
      .eq('key', 'integrations')
      .maybeSingle();
    const jina = data?.value?.jina;
    const firecrawl = data?.value?.firecrawl;
    const searxng = data?.value?.searxng;
    const rawUrl = (searxng?.config?.url as string | undefined)?.trim() || null;
    const priorities: Record<'firecrawl' | 'searxng' | 'jina', number> = {
      firecrawl: Number(firecrawl?.config?.priority) || DEFAULT_PRIORITY.firecrawl,
      searxng: Number(searxng?.config?.priority) || DEFAULT_PRIORITY.searxng,
      jina: Number(jina?.config?.priority) || DEFAULT_PRIORITY.jina,
    };
    const providerOrder = (Object.keys(priorities) as Array<'firecrawl' | 'searxng' | 'jina'>)
      .sort((a, b) => priorities[a] - priorities[b]);
    return {
      preferFreeTier: jina?.config?.preferFreeTier ?? true,
      firecrawlEnabled: firecrawl?.enabled !== false,
      searxngEnabled: searxng?.enabled !== false && !!rawUrl,
      searxngUrl: rawUrl ? rawUrl.replace(/\/+$/, '') : null,
      providerOrder,
    };
  } catch {
    return {
      preferFreeTier: true,
      firecrawlEnabled: true,
      searxngEnabled: false,
      searxngUrl: null,
      providerOrder: ['searxng', 'firecrawl', 'jina'],
    };
  }
}

async function searxngSearch(baseUrl: string, query: string, limit: number, lang?: string): Promise<{ results: SearchResult[]; ok: boolean }> {
  try {
    const params = new URLSearchParams({ q: query, format: 'json' });
    if (lang) params.set('language', lang);
    const res = await fetch(`${baseUrl}/search?${params.toString()}`, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'FlowWink-WebSearch/1.0' },
    });
    if (!res.ok) {
      console.warn('[web-search] SearXNG failed:', res.status);
      return { results: [], ok: false };
    }
    const data = await res.json();
    const results: SearchResult[] = (data.results || []).slice(0, limit).map((r: any) => ({
      title: r.title || '',
      url: r.url || '',
      description: r.content || r.snippet || '',
    }));
    return { results, ok: true };
  } catch (e) {
    console.warn('[web-search] SearXNG error:', e);
    return { results: [], ok: false };
  }
}

async function jinaSearch(query: string, limit: number, apiKey?: string): Promise<{ results: SearchResult[], ok: boolean }> {
  const headers: Record<string, string> = { 'Accept': 'application/json' };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  try {
    const res = await fetch(`https://s.jina.ai/${encodeURIComponent(query)}`, { headers });
    if (res.ok) {
      const data = await res.json();
      const results = (data.data || []).slice(0, limit).map((r: any) => ({
        title: r.title || '',
        url: r.url || '',
        description: r.description || '',
      }));
      return { results, ok: true };
    }
    console.warn(`[web-search] Jina ${apiKey ? 'authenticated' : 'keyless'} failed:`, res.status);
    return { results: [], ok: false };
  } catch (e) {
    console.warn(`[web-search] Jina ${apiKey ? 'authenticated' : 'keyless'} error:`, e);
    return { results: [], ok: false };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query, limit = 5, lang, country, preferred_provider = 'auto' } = await req.json() as WebSearchInput;

    if (!query) {
      return new Response(JSON.stringify({ success: false, error: 'query is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY');
    const jinaKey = Deno.env.get('JINA_API_KEY');
    let results: SearchResult[] = [];
    let provider = 'none';

    const integrationConfig = await getIntegrationConfig();
    const firecrawlAvailable = !!firecrawlKey && integrationConfig.firecrawlEnabled;
    const searxngAvailable = integrationConfig.searxngEnabled && !!integrationConfig.searxngUrl;

    // Resolve provider chain: explicit preferred_provider wins; otherwise sort by
    // admin-configured priority and skip providers that aren't available.
    let chain: Array<'firecrawl' | 'searxng' | 'jina'>;
    if (preferred_provider !== 'auto') {
      chain = [preferred_provider as 'firecrawl' | 'searxng' | 'jina'];
    } else {
      chain = integrationConfig.providerOrder.filter((p) => {
        if (p === 'firecrawl') return firecrawlAvailable;
        if (p === 'searxng') return searxngAvailable;
        return true; // jina has a keyless fallback, always reachable
      });
    }

    for (const candidate of chain) {
      if (results.length > 0) break;

      if (candidate === 'firecrawl' && firecrawlKey) {
        console.log('[web-search] Trying Firecrawl for:', query);
        try {
          const res = await fetch('https://api.firecrawl.dev/v1/search', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${firecrawlKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, limit, lang: lang || undefined, country: country || undefined }),
          });
          if (res.ok) {
            const data = await res.json();
            results = (data.data || []).map((r: any) => ({
              title: r.title || '', url: r.url || '', description: r.description || '',
              content: r.markdown || r.content || undefined,
            }));
            if (results.length > 0) provider = 'firecrawl';
          } else {
            console.warn('[web-search] Firecrawl failed:', res.status);
          }
        } catch (e) {
          console.warn('[web-search] Firecrawl error:', e);
        }
      }

      if (candidate === 'searxng' && integrationConfig.searxngUrl) {
        console.log('[web-search] Trying SearXNG for:', query);
        const sx = await searxngSearch(integrationConfig.searxngUrl, query, limit, lang);
        if (sx.ok && sx.results.length > 0) {
          results = sx.results;
          provider = 'searxng';
        }
      }

      if (candidate === 'jina') {
        const { preferFreeTier } = integrationConfig;
        if (preferFreeTier) {
          console.log('[web-search] Trying Jina (keyless) for:', query);
          const keyless = await jinaSearch(query, limit);
          if (keyless.ok && keyless.results.length > 0) {
            results = keyless.results; provider = 'jina-free';
          } else if (jinaKey) {
            console.log('[web-search] Keyless failed, using Jina API key');
            const authed = await jinaSearch(query, limit, jinaKey);
            if (authed.ok) { results = authed.results; provider = 'jina-api'; }
          }
        } else if (jinaKey) {
          console.log('[web-search] Trying Jina (API key) for:', query);
          const authed = await jinaSearch(query, limit, jinaKey);
          if (authed.ok) { results = authed.results; provider = 'jina-api'; }
        } else {
          console.log('[web-search] Trying Jina (keyless fallback) for:', query);
          const keyless = await jinaSearch(query, limit);
          if (keyless.ok) { results = keyless.results; provider = 'jina-free'; }
        }
      }
    }

    console.log(`[web-search] Found ${results.length} results via ${provider} (chain: ${chain.join('→')})`);

    // provider 'none' means every candidate failed — not that the web is empty.
    // Callers (prospect_research among them) treated the two as the same thing
    // and reported confident emptiness about a company nobody had looked up.
    return new Response(JSON.stringify({
      success: true, provider, results, query,
      ...(provider === 'none' ? {
        search_unavailable: true,
        providers_tried: chain,
        note: 'No search provider returned results. This is a provider failure, not evidence that nothing exists — do not report the subject as unknown or dormant on this basis.',
      } : {}),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[web-search] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
