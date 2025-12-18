import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { BlogTag } from '@/types/cms';
import { useToast } from '@/hooks/use-toast';

export function useBlogTags() {
  return useQuery({
    queryKey: ['blog-tags'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('blog_tags')
        .select('*')
        .order('name');
      
      if (error) throw error;
      return data as BlogTag[];
    },
  });
}

export function useBlogTag(slugOrId: string | undefined) {
  return useQuery({
    queryKey: ['blog-tag', slugOrId],
    queryFn: async () => {
      if (!slugOrId) return null;
      
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slugOrId);
      
      let query = supabase.from('blog_tags').select('*');
      
      if (isUuid) {
        query = query.eq('id', slugOrId);
      } else {
        query = query.eq('slug', slugOrId);
      }
      
      const { data, error } = await query.maybeSingle();
      
      if (error) throw error;
      return data as BlogTag | null;
    },
    enabled: !!slugOrId,
  });
}

export function useCreateBlogTag() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: async ({ name, slug }: { name: string; slug: string }) => {
      const { data, error } = await supabase
        .from('blog_tags')
        .insert({ name, slug })
        .select()
        .single();
      
      if (error) throw error;
      return data as BlogTag;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['blog-tags'] });
      toast({
        title: 'Tag created',
        description: 'A new tag has been created.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useUpdateBlogTag() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: async ({ id, name, slug }: { id: string; name: string; slug: string }) => {
      const { data, error } = await supabase
        .from('blog_tags')
        .update({ name, slug })
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data as BlogTag;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['blog-tags'] });
      toast({
        title: 'Tag updated',
        description: 'Tag has been updated.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useDeleteBlogTag() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('blog_tags')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['blog-tags'] });
      toast({
        title: 'Tag deleted',
        description: 'Tag has been deleted.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// Helper to get or create a tag by name
export function useGetOrCreateBlogTag() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (name: string) => {
      const slug = name.toLowerCase()
        .replace(/[åä]/g, 'a')
        .replace(/ö/g, 'o')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      
      // Check if tag exists
      const { data: existing } = await supabase
        .from('blog_tags')
        .select('*')
        .eq('slug', slug)
        .maybeSingle();
      
      if (existing) return existing as BlogTag;
      
      // Create new tag
      const { data, error } = await supabase
        .from('blog_tags')
        .insert({ name, slug })
        .select()
        .single();
      
      if (error) throw error;
      return data as BlogTag;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['blog-tags'] });
    },
  });
}