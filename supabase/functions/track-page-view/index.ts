import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: PageViewRequest = await req.json();
    
    console.log('[track-page-view] Received request for page:', body.pageSlug);

    // Get client IP
    const clientIp = getClientIp(req);
    console.log('[track-page-view] Client IP:', clientIp || 'unknown');

    // Get geo data
    const geoData = await getGeoData(clientIp);

    // Create Supabase client with service role key for insert
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

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
    });

    if (error) {
      console.error('[track-page-view] Error inserting page view:', error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
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
