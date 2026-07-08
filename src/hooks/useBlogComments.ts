import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type BlogCommentStatus = 'pending' | 'approved' | 'spam' | 'rejected';

export interface BlogComment {
  id: string;
  post_id: string;
  author_name: string;
  author_email: string;
  author_url: string | null;
  body: string;
  status: BlogCommentStatus;
  parent_id: string | null;
  created_at: string;
  updated_at: string;
  moderated_at: string | null;
}

export function useApprovedComments(postId: string | undefined) {
  return useQuery({
    queryKey: ['blog-comments', 'approved', postId],
    enabled: !!postId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('blog_comments')
        .select('id, post_id, author_name, author_email, author_url, body, status, parent_id, created_at, updated_at, moderated_at')
        .eq('post_id', postId!)
        .eq('status', 'approved')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as BlogComment[];
    },
  });
}

export function useAdminComments(status?: BlogCommentStatus) {
  return useQuery({
    queryKey: ['blog-comments', 'admin', status ?? 'all'],
    queryFn: async () => {
      let q = supabase
        .from('blog_comments')
        .select('id, post_id, author_name, author_email, author_url, body, status, parent_id, created_at, updated_at, moderated_at')
        .order('created_at', { ascending: false });
      if (status) q = q.eq('status', status);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as BlogComment[];
    },
  });
}

interface SubmitCommentInput {
  post_id: string;
  author_name: string;
  author_email: string;
  author_url?: string;
  body: string;
  honeypot?: string;
}

export function useSubmitComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SubmitCommentInput) => {
      // Honeypot: any value in the hidden field is a bot; silently accept but do not insert.
      if (input.honeypot && input.honeypot.trim().length > 0) {
        return { ok: true, skipped: true } as const;
      }
      const body = input.body.trim();
      if (body.length < 2 || body.length > 4000) {
        throw new Error('Comment body must be between 2 and 4000 characters');
      }
      const { error } = await supabase.from('blog_comments').insert({
        post_id: input.post_id,
        author_name: input.author_name.trim().slice(0, 120),
        author_email: input.author_email.trim().slice(0, 200),
        author_url: input.author_url?.trim().slice(0, 300) || null,
        body,
        status: 'pending',
      });
      if (error) throw error;
      return { ok: true, skipped: false } as const;
    },
    onSuccess: (_r, vars) => {
      qc.invalidateQueries({ queryKey: ['blog-comments', 'approved', vars.post_id] });
    },
  });
}

export function useModerateComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: BlogCommentStatus }) => {
      const { data, error } = await supabase.rpc('moderate_blog_comment', {
        _comment_id: id,
        _status: status,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['blog-comments'] });
    },
  });
}

export function useDeleteComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('blog_comments').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['blog-comments'] }),
  });
}
