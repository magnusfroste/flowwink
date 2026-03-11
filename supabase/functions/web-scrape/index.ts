import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Web Scrape — Modular integration skill
 * 
 * Scrapes a single URL and returns its content as markdown.
 * Provider priority: Firecrawl (if key available) → Jina Reader
 * Jina: free tier first (if preferFreeTier), then API key, then keyless fallback
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
  preferred_provider?: 'firecrawl' | 'jina' | 'auto';
}

async function getJinaConfig(): Promise<{ preferFreeTier: boolean }> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const sb = createClient(supabaseUrl, serviceKey);
    const { data } = await sb
      .from('site_settings')
      .select('value')
      .eq('key', 'integrations')
      .maybeSingle();
    const jina = data?.value?.jina;
    return { preferFreeTier: jina?.config?.preferFreeTier ?? true };
  } catch {
    return { preferFreeTier: true };
  }
}

async function jinaReader(url: string, maxLength: number, apiKey?: string): Promise<{ content: string, metadata: Record<string, unknown>, ok: boolean }> {
  const headers: Record<string, string> = { 'Accept': 'application/json' };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  try {
    const res = await fetch(`https://r.jina.ai/${url}`, { headers });
    if (res.ok) {
      const data = await res.json();
      const content = (data.data?.content || '').substring(0, maxLength);
      const metadata = { title: data.data?.title, url: data.data?.url };
      return { content, metadata, ok: true };
    }
    console.warn(`[web-scrape] Jina ${apiKey ? 'authenticated' : 'keyless'} failed:`, res.status);
    return { content: '', metadata: {}, ok: false };
  } catch (e) {
    console.warn(`[web-scrape] Jina ${apiKey ? 'authenticated' : 'keyless'} error:`, e);
    return { content: '', metadata: {}, ok: false };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url, max_length = 10000, formats = ['markdown'], preferred_provider = 'auto' } = await req.json() as WebScrapeInput;

    if (!url) {
      return new Response(JSON.stringify({ success: false, error: 'url is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY');
    const jinaKey = Deno.env.get('JINA_API_KEY');
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

    // --- Strategy 2: Jina Reader (free first → API key → keyless fallback) ---
    if (!content) {
      const { preferFreeTier } = await getJinaConfig();

      if (preferFreeTier) {
        // Try keyless first
        console.log('[web-scrape] Trying Jina Reader (keyless) for:', url);
        const keyless = await jinaReader(url, max_length);
        if (keyless.ok && keyless.content) {
          content = keyless.content;
          metadata = keyless.metadata;
          provider = 'jina-free';
        } else if (jinaKey) {
          // Keyless failed, fall back to API key
          console.log('[web-scrape] Keyless failed, using Jina API key');
          const authed = await jinaReader(url, max_length, jinaKey);
          if (authed.ok) {
            content = authed.content;
            metadata = authed.metadata;
            provider = 'jina-api';
          }
        }
      } else if (jinaKey) {
        // preferFreeTier disabled — go straight to API key
        console.log('[web-scrape] Using Jina Reader (API key) for:', url);
        const authed = await jinaReader(url, max_length, jinaKey);
        if (authed.ok) {
          content = authed.content;
          metadata = authed.metadata;
          provider = 'jina-api';
        }
      } else {
        // No API key configured, try keyless anyway
        console.log('[web-scrape] Using Jina Reader (keyless fallback) for:', url);
        const keyless = await jinaReader(url, max_length);
        if (keyless.ok) {
          content = keyless.content;
          metadata = keyless.metadata;
          provider = 'jina-free';
        }
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
