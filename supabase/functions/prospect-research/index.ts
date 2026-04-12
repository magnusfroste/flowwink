import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";

/**
 * Prospect Research — Data Collector (No AI)
 * 
 * Chains: web-search → web-scrape → contact-finder
 * Returns raw data for FlowPilot (or UI) to interpret.
 * 
 * OpenClaw alignment: This is a "hand" — it gathers data.
 * FlowPilot is the "brain" that analyzes the results.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

async function callSkill(functionName: string, body: Record<string, unknown>): Promise<any> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const res = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error(`${functionName} failed:`, text);
    return null;
  }
  return res.json();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { company_name, company_url } = await req.json();

    if (!company_name) {
      return new Response(
        JSON.stringify({ error: 'company_name is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Researching: ${company_name} (${company_url || 'no URL'})`);

    // Step 1: Web search for company info
    const searchResult = await callSkill('web-search', {
      query: `${company_name} company about`,
      limit: 3,
    });

    // Step 2: Scrape company website if URL provided
    let scrapeResult = null;
    const scrapeUrl = company_url || searchResult?.results?.[0]?.url;
    if (scrapeUrl) {
      scrapeResult = await callSkill('web-scrape', {
        url: scrapeUrl,
        max_length: 5000,
      });
    }

    // Step 3: Find contacts via Hunter.io
    let contacts = null;
    const domain = scrapeUrl ? new URL(scrapeUrl).hostname.replace('www.', '') : null;
    if (domain) {
      contacts = await callSkill('contact-finder', {
        action: 'domain_search',
        domain,
        limit: 5,
      });
    }

    // Return raw collected data — no AI interpretation
    const result = {
      success: true,
      company_name,
      company_url: scrapeUrl || null,
      domain,
      search_results: searchResult?.results || [],
      website_content: scrapeResult?.content?.substring(0, 3000) || null,
      website_metadata: scrapeResult?.metadata || null,
      contacts: contacts?.contacts || [],
      data_sources: {
        search: !!searchResult?.results?.length,
        scrape: !!scrapeResult?.content,
        contacts: !!contacts?.contacts?.length,
      },
    };

    console.log(`Research complete for ${company_name}: search=${result.data_sources.search}, scrape=${result.data_sources.scrape}, contacts=${result.data_sources.contacts}`);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Prospect research error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
