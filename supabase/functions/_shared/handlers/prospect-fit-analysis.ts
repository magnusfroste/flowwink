// prospect_fit_analysis — internal skill handler.
//
// Data Aggregator (No AI). Collects BOTH sides of the fit question and returns
// them for FlowPilot (or the admin UI, via useProspectFit) to score:
//   - the prospect side: company, related leads, related deals
//   - our side (`our_context`): ICP + positioning from Business Identity
//     (site_settings.company_profile) and the sender profile from
//     sales_intelligence_profiles
// The reasoning stays in FlowPilot. OpenClaw alignment: "hand" not "brain".
//
// Moved from the standalone `prospect-fit-analysis` edge function
// (edge-surface refactor B1a, wave 1). Response objects are additive-only.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { HandlerCtx } from './qualify-lead.ts';

export async function executeProspectFitAnalysis(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
  ctx?: HandlerCtx,
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

    // Load OUR side: ICP + positioning (Business Identity) and sender profile.
    // Dynamic import keeps this module importable from Node-based unit tests
    // (sales-context.ts resolves an https: Deno specifier at module load).
    let ourContext: Record<string, unknown> | null = null;
    try {
      const { loadSalesContext } = await import('../sales-context.ts');
      const ctxData = await loadSalesContext({
        userId: ctx?.callerUserId ?? undefined,
        includePages: true,
      });
      ourContext = {
        formatted: ctxData.formatted,
        icp: (ctxData.companyProfile as Record<string, unknown>)?.icp ?? null,
        value_proposition: (ctxData.companyProfile as Record<string, unknown>)?.value_proposition ?? null,
        target_industries: (ctxData.companyProfile as Record<string, unknown>)?.target_industries ?? null,
        sender_profile: ctxData.userProfile,
      };
    } catch (ctxError) {
      console.error('[prospect_fit_analysis] Failed to load sales context:', ctxError);
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
        icp_defined: !!ourContext?.icp,
        sender_profile_defined: !!ourContext?.sender_profile,
      },
    };

  } catch (error) {
    console.error('Prospect fit analysis error:', error);
    return { error: error instanceof Error ? error.message : 'Unknown error' };
  }
}
