import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { callSkill } from '@/lib/call-skill';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { ChannelType } from './useContentProposals';

export interface ContentAngle {
  angle: string;
  description: string;
  why_it_works: string;
  hook_example: string;
  best_for_channels: string[];
}

export interface ContentResearch {
  topic_analysis: {
    main_theme: string;
    sub_topics: string[];
    key_questions: string[];
  };
  content_angles: ContentAngle[];
  audience_insights: {
    pain_points: string[];
    desires: string[];
    objections: string[];
    language_patterns: string[];
  };
  competitive_landscape: {
    common_approaches: string[];
    content_gaps: string[];
    differentiation_opportunities: string[];
  };
  content_hooks: {
    curiosity_hooks: string[];
    controversy_hooks: string[];
    story_hooks: string[];
    data_hooks: string[];
  };
  recommended_structure: {
    opening_strategy: string;
    key_points: string[];
    closing_strategy: string;
    cta_suggestions: string[];
  };
  seo_insights?: {
    primary_keywords: string[];
    secondary_keywords: string[];
    questions_people_ask: string[];
  };
}

interface ResearchInput {
  topic: string;
  target_audience?: string;
  industry?: string;
  target_channels: ChannelType[];
}

interface ResearchResponse {
  success: boolean;
  research: ContentResearch;
  ai_provider: string;
  /** Row id of the auto-saved research — carried so the choice can be stamped on it. */
  research_id?: string | null;
}


export function useContentResearch() {
  const [progress, setProgress] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async (input: ResearchInput): Promise<ResearchResponse> => {
      setProgress('Researching topic & generating angles...');

      // Direct skill call, not the chat model-echo dance. The old path asked
      // chat-completion to pick the research_content tool and then ECHO the
      // JSON verbatim — when the model skipped the tool or paraphrased, the
      // parse yielded an empty object and the UI advanced to step 2 with
      // "0 options" as a success (Magnus, live campaign run 2026-08-14; no
      // research_content row in agent_activity = the tool never even ran).
      // A deterministic call has no business passing through a model's mouth.
      const result = await callSkill<Record<string, any>>('research_content', input as unknown as Record<string, unknown>);
      if (result?.error) throw new Error(String(result.error));

      const research = (result?.result ?? result?.research ?? result) as ContentResearch;
      // Empty research is a FAILURE, not a quiet success — never hand the
      // angle-picker "0 options" as if research happened.
      if (!Array.isArray(research?.content_angles) || research.content_angles.length === 0) {
        throw new Error('Research returned no content angles — check the AI provider under Settings and try again.');
      }
      const ai_provider = result?.provider_used ?? result?.ai_provider ?? 'flowpilot';

      // Learning mode: research is ALWAYS persisted, not only when someone
      // presses "Save Research". The fetch is the expensive part and the brief
      // is its provenance — an answer without its question teaches nothing.
      // Fire-and-forget: a failed save must not lose a finished research.
      let research_id: string | null = null;
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const { data: saved, error: saveErr } = await supabase
          .from('content_research')
          .insert([{
            topic: input.topic,
            target_audience: input.target_audience ?? null,
            industry: input.industry ?? null,
            target_channels: input.target_channels ?? [],
            research_data: research as never,
            brief: input as never,
            ai_provider,
            created_by: user?.id ?? null,
          }])
          .select('id')
          .single();
        // PostgREST kastar inte — utan den här raden var catchen nedan död
        // kod och autosparet misslyckades helt ljudlöst.
        if (saveErr) logger.warn('Research auto-save failed (research kept in memory)', saveErr);
        research_id = (saved as { id?: string } | null)?.id ?? null;
      } catch (e) {
        logger.warn('Research auto-save failed (research kept in memory)', e);
      }

      return { success: true, research, ai_provider, research_id };
    },
    onSuccess: (data) => {
      const angleCount = data.research.content_angles?.length || 0;
      toast.success(`Research complete! ${angleCount} content angles generated`);
      setProgress(null);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to complete research');
      setProgress(null);
    },
  });

  return {
    research: mutation.mutateAsync,
    isResearching: mutation.isPending,
    progress,
    reset: mutation.reset,
  };
}
