import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
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
}

export function useContentResearch() {
  const [progress, setProgress] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async (input: ResearchInput): Promise<ResearchResponse> => {
      setProgress('Researching topic & generating angles...');
      
      const { data, error } = await supabase.functions.invoke('research-content', {
        body: input,
      });

      if (error) {
        throw new Error(error.message);
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      return data as ResearchResponse;
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
