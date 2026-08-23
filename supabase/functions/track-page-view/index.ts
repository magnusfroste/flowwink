import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getServiceClient } from '../_shared/supabase-clients.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface UtmPayload {
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_term?: string | null;
  utm_content?: string | null;
}

interface PageViewRequest {
  pageId?: string;
  pageSlug: string;
  pageTitle?: string;
  visitorId?: string;
  sessionId?: string;
  referrer?: string;
  userAgent?: string;
  deviceType?: string;
  browser?: string;
  landingUrl?: string;
  utm?: UtmPayload;
}

interface GeoData {
  country?: string;
  city?: string;
}

async function getGeoData(ip: string): Promise<GeoData> {
  // Skip for localhost/private IPs
  if (!ip || ip === '127.0.0.1' || ip.startsWith('192.168.') || ip.startsWith('10.') || ip === '::1') {
    console.log('[track-page-view] Skipping geo lookup for local IP:', ip);
    return {};
  }

  try {
    // Using ip-api.com - free tier allows 45 requests per minute
    const response = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,city`);
    
    if (!response.ok) {
      console.log('[track-page-view] Geo API response not ok:', response.status);
      return {};
    }

    const data = await response.json();
    
    if (data.status === 'success') {
      console.log('[track-page-view] Geo data retrieved:', { country: data.country, city: data.city });
      return {
        country: data.country || undefined,
        city: data.city || undefined,
      };
    }
    
    console.log('[track-page-view] Geo API returned non-success status:', data);
    return {};
  } catch (error) {
    console.error('[track-page-view] Error fetching geo data:', error);
    return {};
  }
}

function getClientIp(req: Request): string {
  // Try various headers that might contain the real IP
  const forwardedFor = req.headers.get('x-forwarded-for');
  if (forwardedFor) {
    // x-forwarded-for can contain multiple IPs, take the first one (client IP)
    return forwardedFor.split(',')[0].trim();
  }
  
  const realIp = req.headers.get('x-real-ip');
  if (realIp) {
    return realIp.trim();
  }
  
  const cfConnectingIp = req.headers.get('cf-connecting-ip');
  if (cfConnectingIp) {
    return cfConnectingIp.trim();
  }
  
  return '';
}

/**
 * User-agents we refuse to count as visitors. Deliberately conservative: a
 * false positive silently deletes a real visitor from the numbers, which is a
 * worse error than counting a machine. Headless/automation markers and the
 * declared AI crawlers only — no heuristics on "unusual" browsers.
 */
const BOT_UA =
  /(bot\b|bots\b|crawler|spider|slurp|headless|puppeteer|playwright|selenium|phantomjs|lighthouse|chrome-lighthouse|pagespeed|curl\/|wget\/|python-requests|scrapy|axios\/|go-http-client|java\/|okhttp|libwww|httpclient|facebookexternalhit|gptbot|claudebot|claude-web|ccbot|perplexitybot|anthropic-ai|google-extended|bingpreview|semrushbot|ahrefsbot|mj12bot|dotbot|petalbot|dataforseo)/i;

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: PageViewRequest = await req.json();
    
    console.log('[track-page-view] Received request for page:', body.pageSlug);

    // Automated clients are not visitors. Our tracking is client-side JS, so a
    // plain crawler never reaches this function at all — measured 2026-08-22 on
    // a live instance: 628 page views, ZERO matching a bot user-agent. What can
    // still get in is a HEADLESS browser that does execute JS: Lighthouse, a
    // Puppeteer script, an AI crawler that renders. Those inflate the count and,
    // worse, feed visitor intelligence and lead scoring with a machine.
    // Refused here rather than in the client: the client's own JS is exactly
    // what an automated agent may choose not to honour.
    const ua = String(body.userAgent ?? '');
    if (ua && BOT_UA.test(ua)) {
      console.log('[track-page-view] Refused — automated client:', ua.slice(0, 80));
      return new Response(JSON.stringify({ ok: true, skipped: 'automated_client' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get client IP
    const clientIp = getClientIp(req);
    console.log('[track-page-view] Client IP:', clientIp || 'unknown');

    // Get geo data
    const geoData = await getGeoData(clientIp);

    // Create Supabase client with service role key for insert
            const supabase = getServiceClient();

    const utm = body.utm ?? {};
    const hasUtm = !!(utm.utm_source || utm.utm_medium || utm.utm_campaign || utm.utm_term || utm.utm_content);

    // Insert page view
    const { error } = await supabase.from('page_views').insert({
      page_id: body.pageId || null,
      page_slug: body.pageSlug,
      page_title: body.pageTitle || null,
      visitor_id: body.visitorId || null,
      session_id: body.sessionId || null,
      referrer: body.referrer || null,
      user_agent: body.userAgent || null,
      device_type: body.deviceType || null,
      browser: body.browser || null,
      ip_address: clientIp || null,
      country: geoData.country || null,
      city: geoData.city || null,
      landing_url: body.landingUrl || null,
      utm_source: utm.utm_source || null,
      utm_medium: utm.utm_medium || null,
      utm_campaign: utm.utm_campaign || null,
      utm_term: utm.utm_term || null,
      utm_content: utm.utm_content || null,
    });

    if (error) {
      console.error('[track-page-view] Error inserting page view:', error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // If landing has UTMs, log a landing-touch attribution row (best-effort).
    if (hasUtm) {
      const { error: attrErr } = await supabase.from('utm_attributions').insert({
        visitor_id: body.visitorId || null,
        session_id: body.sessionId || null,
        utm_source: utm.utm_source || null,
        utm_medium: utm.utm_medium || null,
        utm_campaign: utm.utm_campaign || null,
        utm_term: utm.utm_term || null,
        utm_content: utm.utm_content || null,
        landing_url: body.landingUrl || null,
        referrer: body.referrer || null,
        touch_type: 'landing',
      });
      if (attrErr) console.error('[track-page-view] utm_attributions insert failed:', attrErr);
    }

    console.log('[track-page-view] Page view tracked successfully');
    
    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const error = err as Error;
    console.error('[track-page-view] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
