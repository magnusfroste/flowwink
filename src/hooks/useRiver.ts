import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type RiverPost = {
  id: string;
  author_id: string;
  body: string;
  media_urls: string[];
  parent_id: string | null;
  pinned: boolean;
  reply_count: number;
  reaction_count: number;
  created_at: string;
};

export type RiverReaction = {
  id: string;
  post_id: string;
  user_id: string;
  emoji: string;
};

export function useRiverFeed(limit = 50) {
  const qc = useQueryClient();

  useEffect(() => {
    const ch = supabase
      .channel('river-feed')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'river_posts' },
        () => qc.invalidateQueries({ queryKey: ['river'] }),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'river_reactions' },
        () => qc.invalidateQueries({ queryKey: ['river'] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  return useQuery({
    queryKey: ['river', 'feed', limit],
    queryFn: async (): Promise<RiverPost[]> => {
      const { data, error } = await supabase
        .from('river_posts')
        .select('*')
        .is('parent_id', null)
        .order('pinned', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data || []) as unknown as RiverPost[];
    },
  });
}

export function useRiverReplies(parentId: string | null) {
  return useQuery({
    queryKey: ['river', 'replies', parentId],
    enabled: !!parentId,
    queryFn: async (): Promise<RiverPost[]> => {
      if (!parentId) return [];
      const { data, error } = await supabase
        .from('river_posts')
        .select('*')
        .eq('parent_id', parentId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as RiverPost[];
    },
  });
}

export function useRiverReactions(postIds: string[]) {
  return useQuery({
    queryKey: ['river', 'reactions', postIds.slice().sort().join(',')],
    enabled: postIds.length > 0,
    queryFn: async (): Promise<RiverReaction[]> => {
      const { data, error } = await supabase
        .from('river_reactions')
        .select('*')
        .in('post_id', postIds);
      if (error) throw error;
      return (data || []) as unknown as RiverReaction[];
    },
  });
}

export function useCreateRiverPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      body: string;
      media_urls?: string[];
      parent_id?: string | null;
    }) => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error('Not authenticated');
      const { data, error } = await supabase
        .from('river_posts')
        .insert({
          author_id: u.user.id,
          body: input.body,
          media_urls: input.media_urls ?? [],
          parent_id: input.parent_id ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['river'] }),
  });
}

export function useDeleteRiverPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('river_posts').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['river'] }),
  });
}

export function useTogglePin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; pinned: boolean }) => {
      const { error } = await supabase
        .from('river_posts')
        .update({ pinned: input.pinned })
        .eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['river'] }),
  });
}

export function useToggleReaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { post_id: string; emoji: string }) => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error('Not authenticated');
      // Check if exists
      const { data: existing } = await supabase
        .from('river_reactions')
        .select('id')
        .eq('post_id', input.post_id)
        .eq('user_id', u.user.id)
        .eq('emoji', input.emoji)
        .maybeSingle();
      if (existing) {
        const { error } = await supabase
          .from('river_reactions')
          .delete()
          .eq('id', existing.id);
        if (error) throw error;
        return { removed: true };
      }
      const { error } = await supabase
        .from('river_reactions')
        .insert({
          post_id: input.post_id,
          user_id: u.user.id,
          emoji: input.emoji,
        });
      if (error) throw error;
      return { added: true };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['river'] }),
  });
}

export async function uploadRiverMedia(file: File): Promise<string> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error('Not authenticated');
  const ext = file.name.split('.').pop() || 'bin';
  const path = `${u.user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage
    .from('river-media')
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from('river-media').getPublicUrl(path);
  return data.publicUrl;
}
