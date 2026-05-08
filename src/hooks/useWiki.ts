import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface WikiPage {
  slug: string;
  title: string;
  content_md: string;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export const HOME_SLUG = 'HomePage';

/** Convert "Some Title" → "SomeTitle" (PascalCase WikiWord). */
export function toWikiSlug(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/[-_]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join('')
    .slice(0, 80);
}

export function useWikiPages() {
  return useQuery({
    queryKey: ['wiki-pages'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wiki_pages')
        .select('slug, title, updated_at, updated_by, created_at')
        .order('updated_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as Pick<WikiPage, 'slug' | 'title' | 'updated_at' | 'updated_by' | 'created_at'>[];
    },
    staleTime: 1000 * 30,
  });
}

export function useWikiPage(slug: string | undefined) {
  return useQuery({
    queryKey: ['wiki-page', slug],
    queryFn: async () => {
      if (!slug) return null;
      const { data, error } = await supabase
        .from('wiki_pages')
        .select('*')
        .eq('slug', slug)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as WikiPage | null;
    },
    enabled: !!slug,
  });
}

export function useUpsertWikiPage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { slug: string; title: string; content_md: string }) => {
      const { data, error } = await supabase
        .from('wiki_pages')
        .upsert(
          {
            slug: input.slug,
            title: input.title,
            content_md: input.content_md,
          },
          { onConflict: 'slug' },
        )
        .select('*')
        .single();
      if (error) throw error;
      return data as WikiPage;
    },
    onSuccess: (page) => {
      qc.invalidateQueries({ queryKey: ['wiki-pages'] });
      qc.setQueryData(['wiki-page', page.slug], page);
    },
    onError: (e: Error) => toast.error(`Save failed: ${e.message}`),
  });
}

export function useDeleteWikiPage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (slug: string) => {
      const { error } = await supabase.from('wiki_pages').delete().eq('slug', slug);
      if (error) throw error;
      return slug;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wiki-pages'] });
      toast.success('Page deleted');
    },
    onError: (e: Error) => toast.error(`Delete failed: ${e.message}`),
  });
}

/** Backlinks — pages whose body references the given slug. */
export function useWikiBacklinks(slug: string | undefined) {
  return useQuery({
    queryKey: ['wiki-backlinks', slug],
    queryFn: async () => {
      if (!slug) return [];
      // Match either [[Slug]] or bare CamelCase `Slug`.
      const { data, error } = await supabase
        .from('wiki_pages')
        .select('slug, title, updated_at')
        .neq('slug', slug)
        .or(
          `content_md.ilike.%[[${slug}]]%,content_md.ilike.%${slug}%`,
        )
        .limit(50);
      if (error) throw error;
      return (data ?? []) as Pick<WikiPage, 'slug' | 'title' | 'updated_at'>[];
    },
    enabled: !!slug,
  });
}
