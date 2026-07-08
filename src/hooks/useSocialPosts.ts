import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type SocialChannel = 'linkedin' | 'x' | 'instagram' | 'facebook' | 'other';
export type SocialPostStatus = 'draft' | 'scheduled' | 'posted' | 'failed' | 'cancelled';

export interface SocialPost {
  id: string;
  content: string;
  channel: SocialChannel;
  media_url: string | null;
  link_url: string | null;
  scheduled_at: string | null;
  status: SocialPostStatus;
  external_ref: string | null;
  external_url: string | null;
  posted_at: string | null;
  error: string | null;
  blog_post_id: string | null;
  campaign_id: string | null;
  created_at: string;
  updated_at: string;
}

export function useSocialPosts(status?: SocialPostStatus) {
  return useQuery({
    queryKey: ['social-posts', status ?? 'all'],
    queryFn: async () => {
      let q = supabase
        .from('social_posts')
        .select('*')
        .order('scheduled_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false });
      if (status) q = q.eq('status', status);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as SocialPost[];
    },
  });
}

interface CreateSocialPost {
  content: string;
  channel: SocialChannel;
  scheduled_at?: string | null;
  status?: SocialPostStatus;
  link_url?: string | null;
  media_url?: string | null;
  blog_post_id?: string | null;
}

export function useCreateSocialPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateSocialPost) => {
      const status = input.status ?? (input.scheduled_at ? 'scheduled' : 'draft');
      const { data, error } = await supabase
        .from('social_posts')
        .insert({
          content: input.content,
          channel: input.channel,
          scheduled_at: input.scheduled_at ?? null,
          status,
          link_url: input.link_url ?? null,
          media_url: input.media_url ?? null,
          blog_post_id: input.blog_post_id ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data as SocialPost;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['social-posts'] }),
  });
}

export function useMarkSocialPostPosted() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; external_ref?: string; external_url?: string }) => {
      const { data, error } = await supabase.rpc('mark_social_post_posted', {
        _post_id: args.id,
        _external_ref: args.external_ref ?? null,
        _external_url: args.external_url ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['social-posts'] }),
  });
}

export function useDeleteSocialPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('social_posts').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['social-posts'] }),
  });
}
