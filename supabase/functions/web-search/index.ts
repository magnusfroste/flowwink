import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

/**
 * Web Search — Modular integration skill
 * 
 * Searches the web for information about a query.
 * Provider priority: Firecrawl (if key available) → Jina Search (keyless fallback)
 * 
 * Used by: prospect-research orchestrator, FlowPilot directly, content research
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface WebSearchInput {
  query: string;
  limit?: number;
  lang?: string;
  country?: string;
}

interface SearchResult {
  title: string;
  url: string;
  description: string;
  content?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query, limit = 5, lang, country } = await req.json() as WebSearchInput;

    if (!query) {
      return new Response(JSON.stringify({ success: false, error: 'query is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY');
    let results: SearchResult[] = [];
    let provider = 'none';

    // --- Strategy 1: Firecrawl Search (paid, higher quality) ---
    if (firecrawlKey) {
      console.log('[web-search] Using Firecrawl for:', query);
      try {
        const res = await fetch('https://api.firecrawl.dev/v1/search', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${firecrawlKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query,
            limit,
            lang: lang || undefined,
            country: country || undefined,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          results = (data.data || []).map((r: any) => ({
            title: r.title || '',
            url: r.url || '',
            description: r.description || '',
            content: r.markdown || r.content || undefined,
          }));
          provider = 'firecrawl';
        } else {
          console.warn('[web-search] Firecrawl failed:', res.status);
        }
      } catch (e) {
        console.warn('[web-search] Firecrawl error:', e);
      }
    }

    // --- Strategy 2: Jina Search (keyless fallback) ---
    if (results.length === 0) {
      console.log('[web-search] Using Jina Search for:', query);
      try {
        const res = await fetch(`https://s.jina.ai/${encodeURIComponent(query)}`, {
          headers: { 'Accept': 'application/json' },
        });

        if (res.ok) {
          const data = await res.json();
          results = (data.data || []).slice(0, limit).map((r: any) => ({
            title: r.title || '',
            url: r.url || '',
            description: r.description || '',
          }));
          provider = 'jina';
        }
      } catch (e) {
        console.warn('[web-search] Jina Search error:', e);
      }
    }

    console.log(`[web-search] Found ${results.length} results via ${provider}`);

    return new Response(JSON.stringify({
      success: true,
      provider,
      results,
      query,
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
