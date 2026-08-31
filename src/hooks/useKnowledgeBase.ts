import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { Json } from '@/integrations/supabase/types';

export interface KbCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string;
  sort_order: number;
  parent_id: string | null;
  is_active: boolean;
  /** Name-per-locale overlay ({"en": {name, description}}). Absent on rows written before the language rail. */
  translations?: Json | null;
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
  /** 'public' (anyone) or 'internal' (staff only). Absent on rows written before the column existed → treated as public. */
  visibility?: 'public' | 'internal';
  /** Language the article is written in (BCP-47). Absent on rows written before the language rail. */
  locale?: string | null;
  /** Articles sharing it are language versions of each other; null = untranslated. */
  translation_group_id?: string | null;
  include_in_chat: boolean;
  views_count: number;
  helpful_count: number;
  not_helpful_count: number;
  positive_feedback_count?: number;
  negative_feedback_count?: number;
  needs_improvement?: boolean;
  meta_json: unknown;
  created_at: string;
  updated_at: string;
  category?: KbCategory;
}

// Clear the auto-set "needs improvement" flag after an article is reworked
// (same backend as the kb_feedback_report skill's clear_flag action).
export function useClearKbImprovementFlag() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (slug: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await supabase.rpc('kb_feedback_report' as any, {
        p_action: 'clear_flag',
        p_slug: slug,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kb-articles'] });
      toast({ title: 'Improvement flag cleared' });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });
}

// Categories hooks
export function useKbCategories() {
  return useQuery({
    queryKey: ['kb-categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('kb_categories')
        .select('*')
        .order('name', { ascending: true });
      
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

/**
 * One published KB article by its slug — the public reading path.
 *
 * Published-only by design: this backs the anonymous `/kb/:slug` page, and an
 * unpublished draft reachable by guessing a URL is a leak, not a feature. RLS
 * already enforces it for anon; the filter keeps a logged-in staff member from
 * seeing a draft here and assuming visitors can too.
 */
export function useKbArticleBySlug(slug?: string) {
  return useQuery({
    queryKey: ['kb-article-slug', slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('kb_articles')
        .select('*, category:kb_categories(*)')
        .eq('slug', slug!)
        .eq('is_published', true)
        .maybeSingle();

      if (error) throw error;
      return (data ?? null) as KbArticle | null;
    },
    enabled: !!slug,
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
      visibility?: 'public' | 'internal';
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
      visibility?: 'public' | 'internal';
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

// Bulk update include_in_chat for multiple articles
export function useBulkUpdateKbArticlesChatStatus() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ ids, include_in_chat }: { ids: string[]; include_in_chat: boolean }) => {
      const { error } = await supabase
        .from('kb_articles')
        .update({ include_in_chat })
        .in('id', ids);
      
      if (error) throw error;
      return { ids, include_in_chat };
    },
    onSuccess: ({ ids, include_in_chat }) => {
      queryClient.invalidateQueries({ queryKey: ['kb-articles'] });
      queryClient.invalidateQueries({ queryKey: ['kb-stats'] });
      toast({ 
        title: `${ids.length} articles updated`,
        description: include_in_chat ? 'Added to AI chat context' : 'Removed from AI chat context'
      });
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

// Stats hook for dashboard.
// Public and internal articles are counted separately — mixing them is exactly
// the confusion the internal tier exists to remove.
export function useKbStats() {
  return useQuery({
    queryKey: ['kb-stats'],
    queryFn: async () => {
      const [categories, published, chatArticles] = await Promise.all([
        supabase.from('kb_categories').select('id', { count: 'exact' }).eq('is_active', true),
        // Read the rows (not just a count) so we can split by audience without a
        // query-level filter on a column that may not exist on older instances.
        supabase.from('kb_articles').select('visibility').eq('is_published', true),
        supabase.from('kb_articles').select('id', { count: 'exact' }).eq('include_in_chat', true),
      ]);

      const rows = (published.data ?? []) as Array<{ visibility?: string | null }>;
      const internal = rows.filter(r => r.visibility === 'internal').length;

      return {
        categories: categories.count || 0,
        articles: rows.length,
        publicArticles: rows.length - internal,
        internalArticles: internal,
        chatArticles: chatArticles.count || 0,
      };
    },

  });
}
