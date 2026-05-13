import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useChatSettings } from './useSiteSettings';
import { ChannelType, ContentProposal } from './useContentProposals';

interface GenerateProposalInput {
  topic: string;
  pillar_content?: string;
  target_channels: ChannelType[];
  brand_voice?: string;
  target_audience?: string;
  tone_level?: number; // 1-5 (1=formal, 5=casual)
  industry?: string;
  content_goals?: string[];
  unique_angle?: string;
  schedule_for?: string;
}

interface GenerateProposalResponse {
  success: boolean;
  proposal: ContentProposal;
  message: string;
  validation_issues?: string[];
}

// Route through FlowPilot (chat-completion) so brand voice, soul, and
// objectives apply to generated content — not a parallel AI pipeline.
// FlowPilot calls generate_content_proposal skill which saves to DB.
const PROPOSAL_SYSTEM_PROMPT = `You are a content generation assistant. When asked to create a content proposal, ALWAYS call the generate_content_proposal tool with all provided parameters. After calling the tool, respond with ONLY the raw JSON object returned by the tool — no prose, no explanation, no markdown. Output only valid JSON.`;

export function useGenerateProposal() {
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState<string | null>(null);
  const { data: chatSettings } = useChatSettings();

  const mutation = useMutation({
    mutationFn: async (input: GenerateProposalInput): Promise<GenerateProposalResponse> => {
      setProgress('Generating content...');

      // Get user ID for proposal attribution (admin is authenticated)
      const { data: { user } } = await supabase.auth.getUser();

      const userMessage = `Generate a content proposal and call generate_content_proposal. user_id="${user?.id || ''}"\n\nBRIEF:\n${JSON.stringify(input)}`;

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
              systemPrompt: PROPOSAL_SYSTEM_PROMPT,
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

      if (!result?.success || !result.proposal) {
        throw new Error(result?.error || 'Failed to generate proposal');
      }

      return result as GenerateProposalResponse;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['content-proposals'] });

      if (data.validation_issues?.length) {
        toast.success(data.message, {
          description: `Note: ${data.validation_issues.length} minor quality suggestions available`,
        });
      } else {
        toast.success(data.message || 'Content proposal generated');
      }

      setProgress(null);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to generate proposal');
      setProgress(null);
    },
  });

  return {
    generateProposal: mutation.mutateAsync,
    isGenerating: mutation.isPending,
    progress,
  };
}
