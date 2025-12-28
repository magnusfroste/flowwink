import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { Json } from '@/integrations/supabase/types';
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string;
  sort_order: number;
  parent_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface KbArticle {
  id: string;
  category_id: string;
  title: string;
  slug: string;
  question: string;
  answer_json: unknown;
  answer_text: string | null;
  sort_order: number;
  is_featured: boolean;
  is_published: boolean;
  include_in_chat: boolean;
  views_count: number;
  helpful_count: number;
  not_helpful_count: number;
  meta_json: unknown;
  created_at: string;
  updated_at: string;
  category?: KbCategory;
}

// Categories hooks
export function useKbCategories() {
  return useQuery({
    queryKey: ['kb-categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('kb_categories')
        .select('*')
        .order('sort_order', { ascending: true });
      
      if (error) throw error;
      return data as KbCategory[];
    },
  });
}

export function useCreateKbCategory() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (category: { name: string; slug: string; description?: string; icon?: string; is_active?: boolean }) => {
      const { data, error } = await supabase
        .from('kb_categories')
        .insert([category])
        .select()
        .single();
      
      if (error) throw error;
      return data as KbCategory;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kb-categories'] });
      toast({ title: 'Category created' });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });
}

export function useUpdateKbCategory() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<KbCategory> & { id: string }) => {
      const { data, error } = await supabase
        .from('kb_categories')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data as KbCategory;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kb-categories'] });
      toast({ title: 'Category updated' });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });
}

export function useDeleteKbCategory() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('kb_categories')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kb-categories'] });
      toast({ title: 'Category deleted' });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });
}

// Articles hooks
export function useKbArticles(categoryId?: string) {
  return useQuery({
    queryKey: ['kb-articles', categoryId],
    queryFn: async () => {
      let query = supabase
        .from('kb_articles')
        .select('*, category:kb_categories(*)')
        .order('sort_order', { ascending: true });
      
      if (categoryId) {
        query = query.eq('category_id', categoryId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as KbArticle[];
    },
  });
}

export function useKbArticle(id: string) {
  return useQuery({
    queryKey: ['kb-article', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('kb_articles')
        .select('*, category:kb_categories(*)')
        .eq('id', id)
        .single();
      
      if (error) throw error;
      return data as KbArticle;
    },
    enabled: !!id,
  });
}

export function useCreateKbArticle() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (article: { 
      category_id: string;
      title: string;
      slug: string;
      question: string;
      answer_json?: Json;
      answer_text?: string;
      is_published?: boolean;
      is_featured?: boolean;
      include_in_chat?: boolean;
    }) => {
      const { data, error } = await supabase
        .from('kb_articles')
        .insert([article])
        .select()
        .single();
      
      if (error) throw error;
      return data as KbArticle;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kb-articles'] });
      toast({ title: 'Article created' });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });
}

export function useUpdateKbArticle() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...updates }: { 
      id: string;
      title?: string;
      slug?: string;
      question?: string;
      category_id?: string;
      answer_json?: Json;
      answer_text?: string;
      is_published?: boolean;
      is_featured?: boolean;
      include_in_chat?: boolean;
    }) => {
      const { data, error } = await supabase
        .from('kb_articles')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data as KbArticle;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['kb-articles'] });
      queryClient.invalidateQueries({ queryKey: ['kb-article', data.id] });
      toast({ title: 'Article updated' });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });
}

export function useDeleteKbArticle() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('kb_articles')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kb-articles'] });
      toast({ title: 'Article deleted' });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });
}

// Stats hook for dashboard
export function useKbStats() {
  return useQuery({
    queryKey: ['kb-stats'],
    queryFn: async () => {
      const [categories, articles, chatArticles] = await Promise.all([
        supabase.from('kb_categories').select('id', { count: 'exact' }).eq('is_active', true),
        supabase.from('kb_articles').select('id', { count: 'exact' }).eq('is_published', true),
        supabase.from('kb_articles').select('id', { count: 'exact' }).eq('include_in_chat', true),
      ]);

      return {
        categories: categories.count || 0,
        articles: articles.count || 0,
        chatArticles: chatArticles.count || 0,
      };
    },
  });
}
