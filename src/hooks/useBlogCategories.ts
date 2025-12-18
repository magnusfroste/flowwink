import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { BlogCategory } from '@/types/cms';
import { useToast } from '@/hooks/use-toast';

export function useBlogCategories() {
  return useQuery({
    queryKey: ['blog-categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('blog_categories')
        .select('*')
        .order('sort_order')
        .order('name');
      
      if (error) throw error;
      return data as BlogCategory[];
    },
  });
}

export function useBlogCategory(slugOrId: string | undefined) {
  return useQuery({
    queryKey: ['blog-category', slugOrId],
    queryFn: async () => {
      if (!slugOrId) return null;
      
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slugOrId);
      
      let query = supabase.from('blog_categories').select('*');
      
      if (isUuid) {
        query = query.eq('id', slugOrId);
      } else {
        query = query.eq('slug', slugOrId);
      }
      
      const { data, error } = await query.maybeSingle();
      
      if (error) throw error;
      return data as BlogCategory | null;
    },
    enabled: !!slugOrId,
  });
}

export function useCreateBlogCategory() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: async ({ 
      name, 
      slug, 
      description,
      parent_id,
      sort_order,
    }: { 
      name: string; 
      slug: string;
      description?: string;
      parent_id?: string;
      sort_order?: number;
    }) => {
      const { data, error } = await supabase
        .from('blog_categories')
        .insert({
          name,
          slug,
          description,
          parent_id,
          sort_order: sort_order || 0,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data as BlogCategory;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['blog-categories'] });
      toast({
        title: 'Category created',
        description: 'A new category has been created.',
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

export function useUpdateBlogCategory() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: async ({ 
      id,
      name, 
      slug, 
      description,
      parent_id,
      sort_order,
    }: { 
      id: string;
      name?: string; 
      slug?: string;
      description?: string;
      parent_id?: string | null;
      sort_order?: number;
    }) => {
      const updates: Partial<BlogCategory> = {};
      
      if (name !== undefined) updates.name = name;
      if (slug !== undefined) updates.slug = slug;
      if (description !== undefined) updates.description = description;
      if (parent_id !== undefined) updates.parent_id = parent_id;
      if (sort_order !== undefined) updates.sort_order = sort_order;
      
      const { data, error } = await supabase
        .from('blog_categories')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data as BlogCategory;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['blog-categories'] });
      toast({
        title: 'Category updated',
        description: 'Category has been updated.',
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

export function useDeleteBlogCategory() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('blog_categories')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['blog-categories'] });
      toast({
        title: 'Category deleted',
        description: 'Category has been deleted.',
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