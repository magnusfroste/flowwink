import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";

/**
 * Prospect Fit Analysis — Data Aggregator (No AI)
 * 
 * Collects company data and returns it for FlowPilot (or UI) to score.
 * 
 * OpenClaw alignment: "hand" not "brain".
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
    const { company_id, company_name } = await req.json();

    if (!company_id && !company_name) {
      return new Response(
        JSON.stringify({ error: 'company_id or company_name is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Load company data
    let company = null;
    if (company_id) {
      const { data } = await supabase
        .from('companies')
        .select('*')
        .eq('id', company_id)
        .single();
      company = data;
    } else if (company_name) {
      const { data } = await supabase
        .from('companies')
        .select('*')
        .ilike('name', `%${company_name}%`)
        .limit(1)
        .maybeSingle();
      company = data;
    }

    // Load related leads
    let relatedLeads: any[] = [];
    if (company) {
      const { data } = await supabase
        .from('leads')
        .select('id, email, name, status, score, source')
        .ilike('company', `%${company.name}%`)
        .limit(10);
      relatedLeads = data || [];
    }

    // Load related deals
    let relatedDeals: any[] = [];
    if (company) {
      const { data } = await supabase
        .from('deals')
        .select('id, title, status, value_cents, currency')
        .eq('company_id', company.id)
        .limit(10);
      relatedDeals = data || [];
    }

    // Return raw data — FlowPilot does the analysis
    return new Response(
      JSON.stringify({
        success: true,
        company: company || { name: company_name, note: 'Not found in CRM' },
        related_leads: relatedLeads,
        related_deals: relatedDeals,
        data_completeness: {
          has_industry: !!company?.industry,
          has_size: !!company?.size,
          has_website: !!company?.website,
          has_domain: !!company?.domain,
          is_enriched: !!company?.enriched_at,
          lead_count: relatedLeads.length,
          deal_count: relatedDeals.length,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Prospect fit analysis error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
