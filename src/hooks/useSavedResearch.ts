import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ContentResearch } from './useContentResearch';
import { ChannelType } from './useContentProposals';
import type { Json } from '@/integrations/supabase/types';

export interface SavedResearch {
  id: string;
  topic: string;
  target_audience: string | null;
  industry: string | null;
  target_channels: ChannelType[];
  research_data: ContentResearch;
  ai_provider: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
}

interface SaveResearchInput {
  topic: string;
  target_audience?: string;
  industry?: string;
  target_channels: ChannelType[];
  research_data: ContentResearch;
  ai_provider?: string;
}

export function useSavedResearch() {
  const queryClient = useQueryClient();

  const { data: savedResearch = [], isLoading } = useQuery({
    queryKey: ['saved-research'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('content_research')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      return (data || []).map(item => ({
        ...item,
        target_channels: (item.target_channels || []) as ChannelType[],
        research_data: item.research_data as unknown as ContentResearch,
      })) as SavedResearch[];
    },
  });

  const saveResearchMutation = useMutation({
    mutationFn: async (input: SaveResearchInput) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('content_research')
        .insert([{
          topic: input.topic,
          target_audience: input.target_audience || null,
          industry: input.industry || null,
          target_channels: input.target_channels,
          research_data: input.research_data as unknown as Json,
          ai_provider: input.ai_provider || null,
          created_by: user?.id || null,
        }])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-research'] });
      toast.success('Research saved successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to save research');
    },
  });

  const deleteResearchMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('content_research')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-research'] });
      toast.success('Research deleted');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete research');
    },
  });

  return {
    savedResearch,
    isLoading,
    saveResearch: saveResearchMutation.mutateAsync,
    isSaving: saveResearchMutation.isPending,
    deleteResearch: deleteResearchMutation.mutateAsync,
    isDeleting: deleteResearchMutation.isPending,
  };
}
