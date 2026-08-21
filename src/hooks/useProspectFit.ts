import { useState } from 'react';
import { callSkill } from '@/lib/call-skill';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { toast } from 'sonner';
import { useChatSettings, usePlatformLocaleSettings } from './useSiteSettings';
import type { FitAnalysisResult } from '@/components/admin/sales-intelligence/types';

/**
 * Prospect fit scoring — interface, not pipeline (Law 3).
 *
 * The `prospect_fit_analysis` skill is a data aggregator: it returns the
 * prospect side (company, related leads/deals) AND our side (`our_context`:
 * ICP + positioning from Business Identity, sender profile from
 * sales_intelligence_profiles). The reasoning happens in FlowPilot via
 * `chat-completion` — this hook only shapes the ask and parses the answer.
 */

export interface ProspectFitOutcome {
  fit: FitAnalysisResult;
  /** Raw aggregator payload, so callers can fall back to a data-only view. */
  raw: Record<string, unknown>;
  /** True when FlowPilot produced the score, false when we fell back. */
  aiScored: boolean;
}

/** 'sv-SE' → 'Swedish' — the prompt wants a language name, not a locale tag. */
function languageName(locale: string): string {
  try {
    const code = locale.split('-')[0];
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) ?? 'English';
  } catch {
    return 'English';
  }
}

function buildPrompt(payload: Record<string, unknown>, analysisLanguage: string): string {
  return [
    'You are scoring a sales prospect for fit against our own ideal customer profile.',
    '',
    'Return ONLY a JSON object (no markdown fences, no prose) with this exact shape:',
    '{',
    '  "fit_score": <integer 0-100>,',
    '  "fit_advice": "<2-4 sentences: why this score, and the next best action>",',
    '  "problem_mapping": [{ "prospect_problem": "...", "our_solution": "..." }],',
    '  "email_subject": "<short, specific subject line>",',
    '  "introduction_letter": "<personal outreach email, signed with the sender profile if present>"',
    '}',
    '',
    'Rules:',
    '- Score against OUR ICP and positioning in `our_context`. If the ICP is empty, say so in fit_advice and score conservatively.',
    '- `company.web_summary` is what we read on THEIR website. Use it to map their business against the problems we solve — problem_mapping entries must reference what they actually do, not generic pains.',
    '- Ground every claim in the data below. Never invent facts about the prospect.',
    '- Write the introduction letter in the sender profile\'s tone when one is provided. Reference something specific about their business so it could not have been sent to anyone else.',
    // Two languages, deliberately different: the analysis is OUR working
    // material (platform language); the letter belongs to the RECIPIENT and
    // follows the language the prospect publishes in.
    `- Language: write fit_advice and problem_mapping in ${analysisLanguage} (our team's working language). Write email_subject and introduction_letter in the language the prospect's own website content (company.web_summary) is written in — they read what they publish; fall back to ${analysisLanguage} if unclear.`,
    '',
    'DATA:',
    JSON.stringify(payload, null, 2),
  ].join('\n');
}

function extractJson(text: string): Record<string, unknown> | null {
  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}


/**
 * Pick the outreach recipient from the leads prospect_research already saved.
 * decision_maker was hardcoded null in both result branches, which kept the
 * send-email button permanently disabled ("No decision-maker email") — the
 * research found and stored contacts, but nothing carried them forward, so the
 * whole module ended one step short of its purpose.
 *
 * Ranking: every fresh lead has score 0, so score alone picks whoever sorts
 * first — an arbitrary "decision maker". Hunter already told us WHO people
 * are: rank on seniority (executive > senior > junior), then personal address
 * over generic (info@), then email confidence. Title comes from provenance
 * instead of the old hardcoded '' that rendered as "Unknown role".
 */
const SENIORITY_RANK: Record<string, number> = { executive: 3, senior: 2, junior: 1 };

type RankableLead = {
  id?: string; email?: string; name?: string; score?: number;
  email_confidence?: number | null;
  email_provenance?: { seniority?: string | null; type?: string | null; position?: string | null } | null;
};

function leadRank(l: RankableLead): number {
  const seniority = SENIORITY_RANK[l.email_provenance?.seniority ?? ''] ?? 0;
  const personal = l.email_provenance?.type === 'generic' ? 0 : 1;
  const confidence = l.email_confidence ?? 0;
  return seniority * 10000 + personal * 1000 + confidence + (l.score ?? 0);
}

function deriveDecisionMaker(raw: unknown): FitAnalysisResult['decision_maker'] {
  const leads = ((raw as { related_leads?: unknown })?.related_leads ?? []) as RankableLead[];
  const withEmail = leads.filter((l) => l?.email);
  if (withEmail.length === 0) return null;
  const best = [...withEmail].sort((a, b) => leadRank(b) - leadRank(a))[0];
  const parts = String(best.name ?? '').trim().split(/\s+/).filter(Boolean);
  return {
    // FitAnalysisCard reads `id` for the CRM link — carried as an extra field.
    ...( { id: best.id } as object ),
    email: best.email as string,
    confidence: best.email_confidence ?? best.score ?? 0,
    first_name: parts[0] ?? '',
    last_name: parts.slice(1).join(' '),
    position: best.email_provenance?.position ?? '',
  };
}

/**
 * Persist the assessment on the company row so it survives the tab closing —
 * "Kommer analysen sparas om jag stänger sidan?" — and reload it on return.
 * One CURRENT assessment per company; run history stays in agent_activity.
 * Fire-and-forget on write: a failed save must not eat a finished analysis.
 */
async function persistFit(companyId: string, fit: FitAnalysisResult, aiScored: boolean): Promise<void> {
  // save_fit_assessment writes the card's CURRENT STATE (fit_score/analysis)
  // and the timeline OBSERVATION (activities) atomically, matrix-gated.
  // The old direct .update() hit companies-RLS that only admin|approver
  // passed — sales/marketing computed a fit, saw it, and the save silently
  // 403'd in this fire-and-forget (Magnus's Redeye fit, 2026-08-20). A denied
  // save is now a TOAST, not a console line nobody reads.
  const { error } = await supabase.rpc('save_fit_assessment' as never, {
    p_company_id: companyId,
    p_fit: { ...fit, ai_scored: aiScored },
  } as never);
  if (error) {
    logger.error('Failed to persist fit analysis', error);
    toast.error(`Analysen visas men kunde inte sparas: ${error.message}`);
  }
}

export async function loadSavedFit(companyId: string): Promise<FitAnalysisResult | null> {
  const { data } = await supabase
    .from('companies')
    .select('fit_analysis')
    .eq('id', companyId)
    .maybeSingle();
  const saved = (data as { fit_analysis?: unknown } | null)?.fit_analysis;
  if (!saved || typeof saved !== 'object') return null;
  const fit = saved as FitAnalysisResult;
  return typeof fit.fit_score === 'number' ? fit : null;
}

export function useProspectFit() {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const { data: chatSettings } = useChatSettings();
  const { data: localeSettings } = usePlatformLocaleSettings();

  const analyze = async (args: { company_id?: string; company_name?: string }): Promise<ProspectFitOutcome> => {
    setIsAnalyzing(true);
    try {
      // 1. Aggregate — prospect data + our ICP/sender context.
      const raw = await callSkill<Record<string, unknown>>('prospect_fit_analysis', args);

      // 2. Reason — FlowPilot scores the fit and drafts the outreach.
      let scored: Record<string, unknown> | null = null;
      try {
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-completion`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
              'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            },
            body: JSON.stringify({
              messages: [{ role: 'user', content: buildPrompt(raw, languageName(localeSettings?.default_locale ?? 'sv-SE')) }],
              settings: {
                aiProvider: chatSettings?.aiProvider || 'openai',
                toolCallingEnabled: false,
                includeContentAsContext: false,
                allowGeneralKnowledge: true,
              },
            }),
          },
        );

        if (response.ok && response.body) {
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let full = '';
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            for (const line of decoder.decode(value, { stream: true }).split('\n')) {
              if (!line.startsWith('data: ')) continue;
              const data = line.slice(6).trim();
              if (data === '[DONE]') continue;
              try {
                const delta = JSON.parse(data)?.choices?.[0]?.delta?.content;
                if (delta) full += delta;
              } catch { /* ignore malformed SSE frames */ }
            }
          }
          scored = extractJson(full);
          if (!scored) logger.error('Fit scoring: AI svarade men JSON kunde inte extraheras', full.slice(0, 300));
        } else {
          logger.error(`Fit scoring: chat-completion HTTP ${response.status}`);
        }
      } catch (e) {
        logger.error('Fit scoring: chat-completion-anropet kastade', e);
        scored = null;
      }

      const companyId = args.company_id
        ?? ((raw as { company?: { id?: string } })?.company?.id ?? undefined);

      // #97 A5: the aggregator has always reported what the score stands on
      // (ICP defined? site read? sender profile?) — relay it so the card can
      // say what was weighed instead of presenting a bare number.
      const completeness = ((raw as Record<string, unknown>)?.data_completeness ?? null) as FitAnalysisResult['data_completeness'];

      if (scored && typeof scored.fit_score === 'number') {
        const fit: FitAnalysisResult = {
          success: true,
          ai_scored: true,
          data_completeness: completeness,
          fit_score: Math.max(0, Math.min(100, Math.round(scored.fit_score as number))),
          fit_advice: (scored.fit_advice as string) ?? 'Fit analysis completed.',
          problem_mapping: Array.isArray(scored.problem_mapping)
            ? (scored.problem_mapping as FitAnalysisResult['problem_mapping'])
            : [],
          introduction_letter: (scored.introduction_letter as string) ?? '',
          email_subject: (scored.email_subject as string) ?? '',
          decision_maker: deriveDecisionMaker(raw),
          leads_updated: 0,
        };
        if (companyId) void persistFit(companyId, fit, true);
        return { raw, aiScored: true, fit };
      }

      const fallback = { ...dataOnlyFit(raw), data_completeness: completeness };
      if (companyId) void persistFit(companyId, fallback, false);
      return { raw, aiScored: false, fit: fallback };
    } finally {
      setIsAnalyzing(false);
    }
  };

  return { analyze, isAnalyzing };
}

/** Deterministic fallback when no AI provider is configured or reasoning fails. */
export function dataOnlyFit(payload: Record<string, any>): FitAnalysisResult {
  const completeness = payload?.data_completeness ?? {};
  const signals = [
    completeness.has_website,
    completeness.has_domain,
    completeness.has_industry,
    completeness.has_size,
    completeness.is_enriched,
  ].filter(Boolean).length;

  const missing = [
    !completeness.has_industry ? 'industry' : null,
    !completeness.has_size ? 'company size' : null,
    !completeness.has_website ? 'website' : null,
    !completeness.has_domain ? 'domain' : null,
  ].filter(Boolean);

  const companyName = payload?.company?.name ?? 'this prospect';
  const leadCount = Number(completeness.lead_count ?? 0);
  const dealCount = Number(completeness.deal_count ?? 0);
  const icpNote = completeness.icp_defined
    ? ''
    : ' No ICP is defined in Business Identity yet — define it to get a real fit score instead of a data snapshot.';

  const advice = missing.length > 0
    ? `Data snapshot for ${companyName}. Coverage is partial — add ${missing.join(', ')} to sharpen the assessment.`
    : `Data snapshot for ${companyName}. Core company signals are present.`;

  return {
    success: true,
    ai_scored: false,
    fit_score: Math.round((signals / 5) * 100),
    fit_advice: `${advice} CRM context: ${leadCount} related lead${leadCount === 1 ? '' : 's'}, ${dealCount} related deal${dealCount === 1 ? '' : 's'}.${icpNote}`,
    problem_mapping: [],
    introduction_letter: '',
    email_subject: '',
    decision_maker: deriveDecisionMaker(payload),
    leads_updated: 0,
  };
}
