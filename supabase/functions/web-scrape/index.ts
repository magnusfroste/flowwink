import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

/**
 * Web Scrape — Modular integration skill
 * 
 * Scrapes a single URL and returns its content as markdown.
 * Provider priority: Firecrawl (if key available) → Jina Reader (keyless fallback)
 * 
 * Used by: prospect-research orchestrator, FlowPilot directly, content research
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface WebScrapeInput {
  url: string;
  max_length?: number;
  formats?: string[];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url, max_length = 10000, formats = ['markdown'] } = await req.json() as WebScrapeInput;

    if (!url) {
      return new Response(JSON.stringify({ success: false, error: 'url is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY');
    let content = '';
    let metadata: Record<string, unknown> = {};
    let provider = 'none';

    // --- Strategy 1: Firecrawl Scrape (paid, higher quality, JS rendering) ---
    if (firecrawlKey) {
      console.log('[web-scrape] Using Firecrawl for:', url);
      try {
        const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${firecrawlKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url,
            formats,
            onlyMainContent: true,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          content = (data.data?.markdown || data.markdown || '').substring(0, max_length);
          metadata = data.data?.metadata || data.metadata || {};
          provider = 'firecrawl';
        } else {
          console.warn('[web-scrape] Firecrawl failed:', res.status);
        }
      } catch (e) {
        console.warn('[web-scrape] Firecrawl error:', e);
      }
    }

    // --- Strategy 2: Jina Reader (keyless fallback) ---
    if (!content) {
      console.log('[web-scrape] Using Jina Reader for:', url);
      try {
        const res = await fetch(`https://r.jina.ai/${url}`, {
          headers: { 'Accept': 'application/json' },
        });

        if (res.ok) {
          const data = await res.json();
          content = (data.data?.content || '').substring(0, max_length);
          metadata = { title: data.data?.title, url: data.data?.url };
          provider = 'jina';
        }
      } catch (e) {
        console.warn('[web-scrape] Jina Reader error:', e);
      }
    }

    console.log(`[web-scrape] Scraped ${content.length} chars via ${provider}`);

    return new Response(JSON.stringify({
      success: !!content,
      provider,
      content,
      metadata,
      url,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[web-scrape] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
