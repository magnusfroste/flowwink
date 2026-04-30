import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface DocsPage {
  id: string;
  repo_owner: string;
  repo_name: string;
  file_path: string;
  category: string;
  title: string;
  slug: string;
  sort_order: number;
  frontmatter: Record<string, unknown>;
  content: string;
  sha: string;
  synced_at: string;
}

const DEFAULT_REPO = { repo_owner: 'magnusfroste', repo_name: 'flowwink', path: 'docs', branch: 'main' };

/** All docs pages, ordered for sidebar nav. */
export function useDocsPages() {
  return useQuery({
    queryKey: ['docs-pages'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('docs_pages')
        .select('*')
        .order('category', { ascending: true })
        .order('sort_order', { ascending: true })
        .order('title', { ascending: true });
      if (error) throw error;
      return (data ?? []) as DocsPage[];
    },
    staleTime: 1000 * 60 * 5,
  });
}

/** Single docs page by category + slug. */
export function useDocsPage(category?: string, slug?: string) {
  return useQuery({
    queryKey: ['docs-page', category, slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('docs_pages')
        .select('*')
        .eq('category', category!)
        .eq('slug', slug!)
        .maybeSingle();
      if (error) throw error;
      return data as DocsPage | null;
    },
    enabled: !!category && !!slug,
  });
}

/** Trigger a GitHub re-sync (admin action). */
export function useSyncDocs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (overrides?: Partial<typeof DEFAULT_REPO>) => {
      const body = { ...DEFAULT_REPO, ...overrides };
      const { data, error } = await supabase.functions.invoke('docs-sync', { body });
      if (error) throw error;
      return data as { synced: number; skipped: number; deleted: number; total: number };
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['docs-pages'] });
      toast.success(
        `Docs synced — ${data.synced} updated, ${data.skipped} unchanged, ${data.deleted} removed`,
      );
    },
    onError: (e: Error) => toast.error(`Sync failed: ${e.message}`),
  });
}
