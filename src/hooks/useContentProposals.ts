import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type ProposalStatus = 'draft' | 'pending_review' | 'approved' | 'published' | 'archived';

export type ChannelType = 'blog' | 'newsletter' | 'linkedin' | 'instagram' | 'twitter' | 'facebook' | 'print';

export interface ChannelVariant {
  blog?: {
    title: string;
    excerpt: string;
    body: string;
    seo_keywords: string[];
  };
  newsletter?: {
    subject: string;
    preview_text: string;
    blocks: unknown[];
  };
  linkedin?: {
    text: string;
    hashtags: string[];
  };
  instagram?: {
    caption: string;
    hashtags: string[];
    suggested_image_prompt: string;
  };
  twitter?: {
    thread: string[];
  };
  facebook?: {
    text: string;
  };
  print?: {
    format: string;
    content: string;
  };
}

export interface ContentProposal {
  id: string;
  created_at: string;
  updated_at: string;
  status: ProposalStatus;
  topic: string;
  source_research: Record<string, unknown>;
  pillar_content: string | null;
  channel_variants: ChannelVariant;
  scheduled_for: string | null;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  published_channels: string[];
}

interface CreateProposalInput {
  topic: string;
  pillar_content?: string;
  channel_variants?: ChannelVariant;
  scheduled_for?: string;
}

interface UpdateProposalInput {
  id: string;
  topic?: string;
  status?: ProposalStatus;
  pillar_content?: string;
  channel_variants?: ChannelVariant;
  scheduled_for?: string | null;
  approved_by?: string;
  approved_at?: string;
  published_channels?: string[];
}

export function useContentProposals(status?: ProposalStatus) {
  return useQuery({
    queryKey: ['content-proposals', status],
    queryFn: async () => {
      let query = supabase
        .from('content_proposals')
        .select('*')
        .order('created_at', { ascending: false });

      if (status) {
        query = query.eq('status', status);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as ContentProposal[];
    },
  });
}

export function useContentProposal(id: string | undefined) {
  return useQuery({
    queryKey: ['content-proposal', id],
    queryFn: async () => {
      if (!id) return null;

      const { data, error } = await supabase
        .from('content_proposals')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      return data as ContentProposal;
    },
    enabled: !!id,
  });
}

export function useCreateProposal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateProposalInput) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const insertData = {
        topic: input.topic,
        pillar_content: input.pillar_content,
        channel_variants: (input.channel_variants || {}) as unknown as Record<string, unknown>,
        scheduled_for: input.scheduled_for,
        created_by: user?.id,
      };
      
      const { data, error } = await supabase
        .from('content_proposals')
        .insert(insertData as any)
        .select()
        .single();

      if (error) throw error;
      return data as ContentProposal;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['content-proposals'] });
      toast.success('Content proposal created');
    },
    onError: (error) => {
      toast.error('Failed to create proposal: ' + error.message);
    },
  });
}

export function useUpdateProposal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: UpdateProposalInput) => {
      const updateData: Record<string, unknown> = { ...updates };
      if (updates.channel_variants) {
        updateData.channel_variants = updates.channel_variants as unknown as Record<string, unknown>;
      }
      
      const { data, error } = await supabase
        .from('content_proposals')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as ContentProposal;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['content-proposals'] });
      queryClient.invalidateQueries({ queryKey: ['content-proposal', data.id] });
      toast.success('Proposal updated');
    },
    onError: (error) => {
      toast.error('Failed to update proposal: ' + error.message);
    },
  });
}

export function useApproveProposal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data: { user } } = await supabase.auth.getUser();

      const { data, error } = await supabase
        .from('content_proposals')
        .update({
          status: 'approved',
          approved_by: user?.id,
          approved_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as ContentProposal;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['content-proposals'] });
      queryClient.invalidateQueries({ queryKey: ['content-proposal', data.id] });
      toast.success('Proposal approved');
    },
    onError: (error) => {
      toast.error('Failed to approve proposal: ' + error.message);
    },
  });
}

export function useDeleteProposal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('content_proposals')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['content-proposals'] });
      toast.success('Proposal deleted');
    },
    onError: (error) => {
      toast.error('Failed to delete proposal: ' + error.message);
    },
  });
}
