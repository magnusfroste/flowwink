import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";

/**
 * Enrich Company — Data-Only (No AI)
 * 
 * Scrapes a company website via Firecrawl and extracts metadata
 * (title, description, phone, address) from the page's HTML metadata.
 * 
 * AI-powered analysis (industry classification, size estimation) is
 * now FlowPilot's job via the enrich_company skill.
 * 
 * OpenClaw alignment: This function is a "hand" (data fetch + write),
 * not a "brain" (no AI calls).
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { domain, companyId } = await req.json();

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Resolve domain from companyId if needed
    let enrichDomain = domain;
    let targetCompanyId = companyId;

    if (!enrichDomain && companyId) {
      const { data: company, error: companyError } = await supabase
        .from('companies')
        .select('id, domain, enriched_at')
        .eq('id', companyId)
        .single();

      if (companyError || !company) {
        return new Response(
          JSON.stringify({ error: 'Company not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (!company.domain) {
        return new Response(
          JSON.stringify({ error: 'Company has no domain to enrich' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (company.enriched_at) {
        return new Response(
          JSON.stringify({ success: true, message: 'Already enriched', skipped: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      enrichDomain = company.domain;
      targetCompanyId = company.id;
    }

    if (!enrichDomain) {
      return new Response(
        JSON.stringify({ error: 'Domain or companyId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!firecrawlApiKey) {
      return new Response(
        JSON.stringify({ error: 'FIRECRAWL_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Normalize domain to URL
    const url = enrichDomain.startsWith('http') ? enrichDomain : `https://${enrichDomain}`;
    console.log(`Scraping website: ${url}`);

    // Scrape with Firecrawl
    const scrapeResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        formats: ['markdown'],
        onlyMainContent: true,
      }),
    });

    if (!scrapeResponse.ok) {
      const errorText = await scrapeResponse.text();
      console.error('Firecrawl error:', errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to scrape website', details: errorText }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const scrapeData = await scrapeResponse.json();
    const pageContent = scrapeData.data?.markdown || '';
    const metadata = scrapeData.data?.metadata || {};

    // Extract data from metadata (deterministic — no AI)
    const enrichment = {
      website: url,
      description: metadata.description || metadata.ogDescription || null,
      phone: extractPhone(pageContent),
      address: null as string | null,
      raw_content: pageContent.substring(0, 5000), // For FlowPilot to analyze later
    };

    console.log('Enrichment result:', JSON.stringify({ ...enrichment, raw_content: `[${enrichment.raw_content?.length || 0} chars]` }));

    // Update company record
    if (targetCompanyId) {
      const { error: updateError } = await supabase
        .from('companies')
        .update({
          website: enrichment.website,
          notes: enrichment.description || undefined,
          phone: enrichment.phone || undefined,
          enriched_at: new Date().toISOString(),
        })
        .eq('id', targetCompanyId);

      if (updateError) {
        console.error('Failed to update company:', updateError);
      } else {
        console.log(`Company ${targetCompanyId} enriched successfully`);
      }
    }

    return new Response(
      JSON.stringify({ success: true, data: enrichment, companyId: targetCompanyId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in enrich-company:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

/** Extract phone number from content using regex (deterministic) */
function extractPhone(content: string): string | null {
  // Swedish and international phone patterns
  const patterns = [
    /(?:tel|phone|telefon)[:\s]*([+\d\s()-]{8,20})/i,
    /(\+46[\s.-]?\d{1,3}[\s.-]?\d{3,4}[\s.-]?\d{2,4})/,
    /(0\d{1,3}[\s.-]?\d{3,4}[\s.-]?\d{2,4})/,
  ];
  for (const p of patterns) {
    const m = content.match(p);
    if (m) return m[1].trim();
  }
  return null;
}
