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
import { loadSalesContext } from '../sales-context.ts';

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
      // leads has no `company` text column — the old ilike on it errored on
      // every call, so related_leads was ALWAYS empty: the fit analysis never
      // learned that prospect_research had already saved contacts, and the
      // send-email step downstream had nobody to address. company_id is the
      // very column prospect-research writes.
      // Trust fields ride along: seniority/position (provenance) let the
      // decision-maker derivation rank on WHO someone is instead of a score
      // that is 0 for every fresh lead, and confidence/status feed the send gate.
      const { data } = await supabase
        .from('leads')
        .select('id, email, name, status, score, source, email_confidence, email_status, email_provenance')
        .eq('company_id', company.id)
        .limit(10);
      relatedLeads = data || [];
    }

    // Load related deals
    // A deal hangs off a lead (deals has no company_id, title or status):
    // this asked for all three, the query failed unread, and every fit saw
    // zero deals (2026-10-31). The company's deals are its leads' deals.
    let relatedDeals: any[] = [];
    const leadIds = relatedLeads.map((l: { id: string }) => l.id);
    if (leadIds.length) {
      const { data, error: dealsErr } = await supabase
        .from('deals')
        .select('id, lead_id, stage, value_cents, currency, expected_close')
        .in('lead_id', leadIds)
        .limit(10);
      if (dealsErr) console.warn('[prospect-fit] deals unreadable:', dealsErr.message);
      relatedDeals = data || [];
    }

    // Load OUR side: ICP + positioning (Business Identity) and sender profile.
    // Static import + injected client — the previous `await import(...)` (kept
    // for Node-test compatibility) was rejected by the deployed edge runtime,
    // so our_context was ALWAYS null in production and every fit was scored
    // against an "undefined" ICP.
    let ourContext: Record<string, unknown> | null = null;
    let ourContextError: string | null = null;
    try {
      const ctxData = await loadSalesContext(supabase, {
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
      // Self-reporting, not just logged: a swallowed error here cost us two
      // debugging rounds (dynamic import, then Tiptap-object .replace) because
      // the response only showed our_context: null with no why.
      ourContextError = ctxError instanceof Error ? ctxError.message : String(ctxError);
      console.error('[prospect_fit_analysis] Failed to load sales context:', ctxError);
    }

    // The previous assessment must not grade the next one: strip persisted
    // fit_* fields so the scorer reasons from evidence, not from its own echo.
    // web_raw is stripped too — it is the ARCHIVE (up to 20k chars of raw
    // scrape); web_summary is the distilled working set the prompt should see.
    let companyPayload: Record<string, unknown> | { name?: string; note: string };
    if (company) {
      const { fit_score: _fs, fit_analysis: _fa, fit_analyzed_at: _ft, web_raw: _wr, ...rest } = company as Record<string, unknown>;
      companyPayload = rest;
    } else {
      companyPayload = { name: company_name, note: 'Not found in CRM' };
    }

    // Return raw data — FlowPilot does the analysis
    return {
      success: true,
      company: companyPayload,
      related_leads: relatedLeads,
      related_deals: relatedDeals,
      our_context: ourContext,
      ...(ourContextError ? { our_context_error: ourContextError } : {}),
      data_completeness: {
        has_industry: !!company?.industry,
        has_size: !!company?.size,
        has_website: !!company?.website,
        has_domain: !!company?.domain,
        // web_summary = what research READ on their site; with it present the
        // scorer should never claim it knows nothing about the prospect.
        has_web_summary: !!company?.web_summary,
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
