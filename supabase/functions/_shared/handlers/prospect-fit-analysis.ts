// prospect_fit_analysis — internal skill handler.
//
// Data Aggregator (No AI). Collects the prospect side (company, leads, deals)
// AND our side (ICP + positioning from Business Identity, sender profile from
// sales_intelligence_profiles) and returns both for FlowPilot (or the admin UI
// via chat-completion) to score. OpenClaw alignment: "hand" not "brain".
//
// Moved from the standalone `prospect-fit-analysis` edge function
// (edge-surface refactor B1a, wave 1). Response objects extended with
// `our_context` — existing fields unchanged.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';


export async function executeProspectFitAnalysis(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  try {
    const { company_id, company_name } = args as { company_id?: string; company_name?: string };

    if (!company_id && !company_name) {
      return { error: 'company_id or company_name is required' };
    }

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

    // --- Our side of the fit equation ---------------------------------------
    // The ICP lives in Business Identity (site_settings.company_profile) — the
    // single source of truth. Sales Intelligence never keeps its own copy; it
    // reads it here and hands it to the reasoning layer together with the
    // prospect data. The sender profile (pitch/tone/signature) comes from
    // sales_intelligence_profiles (type=user) and only shapes the outreach.
    let ourContext: Record<string, unknown> = {};
    try {
      // Dynamic import: sales-context.ts pulls in the Deno supabase client, which a
      // Node-based unit test cannot resolve. Loading it here keeps the handler
      // importable outside Deno (the catch below yields the ICP-undefined shape).
      const { loadSalesContext } = await import('../sales-context.ts');
      const ctxData = await loadSalesContext({
        userId: (args.user_id as string) || undefined,
        includePages: true,
        maxPageTokens: 4000,
      });
      const cp = ctxData.companyProfile || {};
      ourContext = {
        formatted: ctxData.formatted,
        icp: cp.icp ?? null,
        value_proposition: cp.value_proposition ?? null,
        differentiators: cp.differentiators ?? null,
        target_industries: cp.target_industries ?? null,
        services: cp.services ?? null,
        competitors: cp.competitors ?? null,
        sender_profile: ctxData.userProfile,
        icp_defined: !!(cp.icp && String(cp.icp).trim()),
        sender_profile_defined: !!ctxData.userProfile,
      };
    } catch (e) {
      console.error('loadSalesContext failed:', e instanceof Error ? e.message : e);
      ourContext = { icp: null, icp_defined: false, sender_profile: null, sender_profile_defined: false };
    }

    // Return raw data — FlowPilot does the analysis
    return {
      success: true,
      company: company || { name: company_name, note: 'Not found in CRM' },
      related_leads: relatedLeads,
      related_deals: relatedDeals,
      our_context: ourContext,
      data_completeness: {
        has_industry: !!company?.industry,
        has_size: !!company?.size,
        has_website: !!company?.website,
        has_domain: !!company?.domain,
        is_enriched: !!company?.enriched_at,
        lead_count: relatedLeads.length,
        deal_count: relatedDeals.length,
        icp_defined: !!(ourContext as { icp_defined?: boolean }).icp_defined,
      },
    };

  } catch (error) {
    console.error('Prospect fit analysis error:', error);
    return { error: error instanceof Error ? error.message : 'Unknown error' };
  }
}
