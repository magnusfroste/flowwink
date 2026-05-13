import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useChatSettings } from './useSiteSettings';
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

// Route through FlowPilot (chat-completion) so brand voice, soul, and
// objectives shape the research — not a parallel AI pipeline.
const RESEARCH_SYSTEM_PROMPT = `You are a content strategist assistant. When asked to research a content topic, ALWAYS call the research_content tool with all provided parameters. After calling the tool, respond with ONLY the raw JSON object returned by the tool — no prose, no explanation, no markdown. Output only valid JSON.`;

export function useContentResearch() {
  const [progress, setProgress] = useState<string | null>(null);
  const { data: chatSettings } = useChatSettings();

  const mutation = useMutation({
    mutationFn: async (input: ResearchInput): Promise<ResearchResponse> => {
      setProgress('Researching topic & generating angles...');

      const userMessage = `Research content for the following brief and call research_content:\n${JSON.stringify(input)}`;

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
              systemPrompt: RESEARCH_SYSTEM_PROMPT,
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
      const result = JSON.parse(jsonStr);

      // Handle both direct research response and wrapped { success, research } format
      if (result?.success !== undefined) {
        return result as ResearchResponse;
      }
      // result IS the research object directly
      return { success: true, research: result as ContentResearch, ai_provider: 'flowpilot' };
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
