import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { webSearch } from '../_shared/web/layer.ts';

/**
 * Web Search — the `search` capability of the web layer (_shared/web).
 *
 * A query → results, from the first provider in the admin's order
 * (Integrations → Web search & reading: SearXNG, Firecrawl — cloud or
 * self-hosted — or Jina) that answers. The answer names the provider and the
 * attempts. Used by: search_web, the chat's web_search tool, Flowwork,
 * prospect research, company enrichment.
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
  /** 'auto' (default) follows the admin's order; a provider id tries that one alone. */
  preferred_provider?: 'firecrawl' | 'jina' | 'searxng' | 'auto';
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

    const out = await webSearch({ query, limit, lang, country, preferred: preferred_provider });
    console.log(`[web-search] ${out.results.length} results via ${out.provider} (chain: ${out.chain.join('→') || 'none'})`);

    // provider 'none' means every candidate failed — not that the web is empty.
    // Callers (prospect_research among them) treated the two as the same thing
    // and reported confident emptiness about a company nobody had looked up.
    return new Response(JSON.stringify({
      success: true, provider: out.provider, results: out.results, query, attempts: out.attempts,
      ...(out.provider === 'none' ? {
        search_unavailable: true,
        providers_tried: out.chain,
        note: out.chain.length
          ? 'No search provider returned results. This is a provider failure, not evidence that nothing exists — do not report the subject as unknown or dormant on this basis.'
          : 'No search provider is configured or switched on (Integrations → Web search & reading). This is a configuration gap, not evidence that nothing exists.',
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
