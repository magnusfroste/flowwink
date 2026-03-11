import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

/**
 * Browser Fetch — Hybrid Operator Skill
 *
 * Intelligent URL fetching that picks the right strategy:
 * 
 * 1. If the URL is a login-walled site (LinkedIn, X, GitHub private),
 *    it returns a "relay_required" response telling the admin panel
 *    to use the Chrome Extension relay (user's real browser session).
 *
 * 2. If the URL is public, it falls through to scrape-url (Firecrawl).
 *
 * This mirrors OpenClaw's Extension Relay vs Standalone CDP pattern,
 * keeping LinkedIn/X fetches ToS-compliant (user's own browser session).
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Sites that require authenticated browser session (login-walled)
const RELAY_DOMAINS = [
  'linkedin.com', 'www.linkedin.com',
  'x.com', 'twitter.com', 'www.twitter.com',
  'github.com', // private repos
  'facebook.com', 'www.facebook.com',
  'instagram.com', 'www.instagram.com',
  'mail.google.com',
];

function requiresRelay(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return RELAY_DOMAINS.some(d => hostname === d || hostname.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url, force_relay = false, relay_result = null } = await req.json();

    if (!url) {
      return new Response(JSON.stringify({ error: 'url is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Normalize URL
    let targetUrl = url.trim();
    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      targetUrl = `https://${targetUrl}`;
    }

    // ─── Path A: Relay result coming back from the Chrome extension ─────
    if (relay_result) {
      console.log(`[browser-fetch] Received relay result for: ${targetUrl}`);
      return new Response(JSON.stringify({
        url: targetUrl,
        title: relay_result.title || '',
        description: relay_result.description || '',
        markdown: relay_result.content || relay_result.markdown || '',
        html: relay_result.html || '',
        links: relay_result.links || [],
        source: 'extension_relay',
        source_url: targetUrl,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ─── Path B: Needs Chrome Extension relay ───────────────────────────
    if (requiresRelay(targetUrl) || force_relay) {
      console.log(`[browser-fetch] Relay required for: ${targetUrl}`);
      return new Response(JSON.stringify({
        action: 'relay_required',
        url: targetUrl,
        message: `This URL requires browser relay (login-walled site). The admin panel should use the Chrome Extension to fetch this page using your authenticated browser session.`,
        relay_instruction: {
          type: 'navigate_and_scrape',
          url: targetUrl,
        },
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ─── Path C: Public URL → delegate to scrape-url (Firecrawl) ───────
    console.log(`[browser-fetch] Public URL, delegating to scrape-url: ${targetUrl}`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const scrapeResp = await fetch(`${supabaseUrl}/functions/v1/scrape-url`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ url: targetUrl, formats: ['markdown'] }),
    });

    const scrapeData = await scrapeResp.json();

    if (!scrapeResp.ok) {
      return new Response(JSON.stringify({
        error: scrapeData.error || 'Scrape failed',
        url: targetUrl,
        fallback_suggestion: 'Try using browser_fetch with force_relay=true if the Chrome Extension is available.',
      }), {
        status: scrapeResp.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      ...scrapeData,
      source: 'firecrawl',
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('[browser-fetch] Error:', err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
