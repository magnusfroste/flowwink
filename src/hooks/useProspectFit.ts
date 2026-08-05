import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useChatSettings } from './useSiteSettings';
import type { FitAnalysisResult } from '@/components/admin/sales-intelligence/types';

/**
 * Prospect fit analysis, scored by FlowPilot.
 *
 * Law 3: the UI is an interface, not a pipeline. The scoring runs through
 * chat-completion (FlowPilot), which calls the `prospect_fit_analysis` skill to
 * collect the prospect data + our ICP (Business Identity) + sender profile, and
 * then reasons over it. No parallel AI pipeline lives in the frontend.
 */
const FIT_SYSTEM_PROMPT = `You are a B2B sales analyst. When asked to evaluate a prospect, ALWAYS call the prospect_fit_analysis tool first to collect data.

The tool returns the prospect (company, related leads, deals) and \`our_context\` — our ICP, value proposition, differentiators, target industries and services from Business Identity, plus the sender profile.

Score fit against the ICP in \`our_context\` — NOT against data completeness. If \`our_context.icp_defined\` is false, say so explicitly in fit_advice and score conservatively.

Respond with ONLY a raw JSON object, no prose, no markdown:
{
  "fit_score": <0-100 integer>,
  "fit_advice": "<2-4 sentences: why this score, what to do next>",
  "problem_mapping": [{ "prospect_problem": "...", "our_solution": "..." }],
  "introduction_letter": "<short personal outreach email in the sender's tone, using their signature if present>",
  "email_subject": "<subject line>"
}`;

interface FitInput {
  company_id?: string;
  company_name?: string;
}

export function useProspectFit() {
  const { data: chatSettings } = useChatSettings();

  const mutation = useMutation({
    mutationFn: async (input: FitInput): Promise<FitAnalysisResult> => {
      const userMessage = `Evaluate this prospect against our ICP and draft an introduction. Call prospect_fit_analysis with: ${JSON.stringify(input)}`;

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
            messages: [{ role: 'user', content: userMessage }],
            settings: {
              aiProvider: chatSettings?.aiProvider || 'openai',
              systemPrompt: FIT_SYSTEM_PROMPT,
              toolCallingEnabled: true,
              allowGeneralKnowledge: false,
              includeContentAsContext: false,
            },
          }),
        }
      );

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      // Accumulate SSE stream
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) fullContent += delta;
          } catch { /* ignore malformed SSE frames */ }
        }
      }

      const jsonStr = fullContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const match = jsonStr.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('FlowPilot returned no fit assessment');
      const parsed = JSON.parse(match[0]) as Partial<FitAnalysisResult>;

      const score = Number(parsed.fit_score);
      if (!Number.isFinite(score)) throw new Error('FlowPilot returned no fit score');

      return {
        success: true,
        fit_score: Math.max(0, Math.min(100, Math.round(score))),
        fit_advice: parsed.fit_advice || 'Fit analysis completed.',
        problem_mapping: Array.isArray(parsed.problem_mapping) ? parsed.problem_mapping : [],
        introduction_letter: parsed.introduction_letter || '',
        email_subject: parsed.email_subject || '',
        decision_maker: parsed.decision_maker ?? null,
        leads_updated: 0,
      };
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Fit analysis failed');
    },
  });

  return {
    analyzeFit: mutation.mutateAsync,
    isAnalyzing: mutation.isPending,
    reset: mutation.reset,
  };
}
