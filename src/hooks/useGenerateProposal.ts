import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
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

export function useGenerateProposal() {
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async (input: GenerateProposalInput): Promise<GenerateProposalResponse> => {
      setProgress('Generating content...');
      
      const { data, error } = await supabase.functions.invoke('generate-content-proposal', {
        body: input,
      });

      if (error) {
        throw new Error(error.message);
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      return data as GenerateProposalResponse;
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
