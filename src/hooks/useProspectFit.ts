import { useState } from 'react';
import { callSkill } from '@/lib/call-skill';
import { useChatSettings } from './useSiteSettings';
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

function buildPrompt(payload: Record<string, unknown>): string {
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
    '- Ground every claim in the data below. Never invent facts about the prospect.',
    '- Write the introduction letter in the sender profile\'s tone when one is provided.',
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

export function useProspectFit() {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const { data: chatSettings } = useChatSettings();

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
              messages: [{ role: 'user', content: buildPrompt(raw) }],
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
        }
      } catch {
        scored = null;
      }

      if (scored && typeof scored.fit_score === 'number') {
        return {
          raw,
          aiScored: true,
          fit: {
            success: true,
            fit_score: Math.max(0, Math.min(100, Math.round(scored.fit_score as number))),
            fit_advice: (scored.fit_advice as string) ?? 'Fit analysis completed.',
            problem_mapping: Array.isArray(scored.problem_mapping)
              ? (scored.problem_mapping as FitAnalysisResult['problem_mapping'])
              : [],
            introduction_letter: (scored.introduction_letter as string) ?? '',
            email_subject: (scored.email_subject as string) ?? '',
            decision_maker: null,
            leads_updated: 0,
          },
        };
      }

      return { raw, aiScored: false, fit: dataOnlyFit(raw) };
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
    fit_score: Math.round((signals / 5) * 100),
    fit_advice: `${advice} CRM context: ${leadCount} related lead${leadCount === 1 ? '' : 's'}, ${dealCount} related deal${dealCount === 1 ? '' : 's'}.${icpNote}`,
    problem_mapping: [],
    introduction_letter: '',
    email_subject: '',
    decision_maker: null,
    leads_updated: 0,
  };
}
