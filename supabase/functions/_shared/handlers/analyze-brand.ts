import { extractBranding, type FirecrawlBranding } from '../extract-branding.ts';
import { loadWebContext, firecrawlEndpoint } from '../web/layer.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Moved VERBATIM from supabase/functions/analyze-brand/index.ts (edge-surface B1b).
// Kept as a Request→Response handler; agent-execute adapts args↔Request via
// callResponseHandler — zero body changes.
export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url } = await req.json();

    if (!url) {
      return new Response(
        JSON.stringify({ success: false, error: 'URL is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // NOTE: Brand analysis needs the `branding` format (colours, fonts, logo),
    // which only Firecrawl has — so it does not follow the web layer's read
    // order. Firecrawl's address and key still come from the layer (cloud or
    // self-hosted, Integrations → Web search & reading).
    const fc = firecrawlEndpoint(await loadWebContext());
    if (!fc.available) {
      return new Response(
        JSON.stringify({ success: false, error: 'Brand analysis needs Firecrawl — the only provider that extracts colours, fonts and logo. Add FIRECRAWL_API_KEY, or a self-hosted Firecrawl URL, under Integrations → Web search & reading.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let formattedUrl = url.trim();
    if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
      formattedUrl = `https://${formattedUrl}`;
    }

    console.log('Analyzing brand from URL:', formattedUrl);

    const response = await fetch(`${fc.baseUrl}/v1/scrape`, {
      method: 'POST',
      headers: {
        ...(fc.key ? { 'Authorization': `Bearer ${fc.key}` } : {}),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: formattedUrl,
        formats: ['branding'],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Firecrawl API error:', data);
      return new Response(
        JSON.stringify({ success: false, error: data.error || `Firecrawl error: ${response.status}` }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const rawBranding: FirecrawlBranding = data.data?.branding || data.branding || {};
    const extracted = extractBranding(rawBranding);

    console.log('Brand analysis successful:', JSON.stringify(extracted));

    return new Response(
      JSON.stringify({
        success: true,
        branding: rawBranding,
        extracted,
        sourceUrl: formattedUrl,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error analyzing brand:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Could not analyze website' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}
