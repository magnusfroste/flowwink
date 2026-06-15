import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface DocsPage {
  id: string;
  source: 'github' | 'app';
  is_published: boolean;
  repo_owner: string | null;
  repo_name: string | null;
  file_path: string | null;
  category: string;
  title: string;
  slug: string;
  sort_order: number;
  frontmatter: Record<string, unknown>;
  content: string;
  sha: string;
  synced_at: string;
}

export interface DocsPageVersion {
  id: string;
  docs_page_id: string;
  version_no: number;
  title: string;
  content: string;
  category: string | null;
  slug: string | null;
  frontmatter: Record<string, unknown>;
  edited_by: string | null;
  created_at: string;
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
      return data as
        | { synced: number; skipped: number; deleted: number; total: number }
        | { accepted: true; message: string };
    },
    onSuccess: (data) => {
      if ('accepted' in data) {
        toast.success('Sync started — refresh in ~30s to see updated counts');
        // Re-fetch after the background job has had time to complete.
        setTimeout(() => qc.invalidateQueries({ queryKey: ['docs-pages'] }), 30000);
      } else {
        qc.invalidateQueries({ queryKey: ['docs-pages'] });
        toast.success(
          `Docs synced — ${data.synced} updated, ${data.skipped} unchanged, ${data.deleted} removed`,
        );
      }
    },
    onError: (e: Error) => toast.error(`Sync failed: ${e.message}`),
  });
}

export interface ManageDocsPageInput {
  action: 'create' | 'update' | 'delete' | 'restore_version';
  id?: string;
  title?: string;
  content?: string;
  category?: string;
  slug?: string;
  is_published?: boolean;
  version_no?: number;
}

/** Create / update / delete / restore an in-app docs page via the manage_docs_page RPC. */
export function useManageDocsPage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ManageDocsPageInput) => {
      const { data: auth } = await supabase.auth.getUser();
      // The rpc handler maps p_-prefixed params; this RPC may be absent from the
      // generated types until they are regenerated, so the call is loosely typed.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)('manage_docs_page', {
        p_action: input.action,
        p_id: input.id ?? null,
        p_title: input.title ?? null,
        p_content: input.content ?? null,
        p_category: input.category ?? null,
        p_slug: input.slug ?? null,
        p_is_published: input.is_published ?? null,
        p_version_no: input.version_no ?? null,
        p_editor: auth?.user?.id ?? null,
      });
      if (error) throw error;
      return data as { success: boolean; action: string; id?: string; slug?: string };
    },
    onSuccess: (data, vars) => {
      qc.invalidateQueries({ queryKey: ['docs-pages'] });
      if (vars.id) qc.invalidateQueries({ queryKey: ['docs-page-versions', vars.id] });
      const verb =
        vars.action === 'create' ? 'created'
        : vars.action === 'delete' ? 'deleted'
        : vars.action === 'restore_version' ? 'restored'
        : 'saved';
      toast.success(`Doc page ${verb}`);
    },
    onError: (e: Error) => toast.error(`Doc save failed: ${e.message}`),
  });
}

/** Version history for a docs page (most-recent first). */
export function useDocsPageVersions(pageId?: string) {
  return useQuery({
    queryKey: ['docs-page-versions', pageId],
    queryFn: async () => {
      // docs_page_versions may be absent from generated types until regenerated.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('docs_page_versions')
        .select('*')
        .eq('docs_page_id', pageId!)
        .order('version_no', { ascending: false });
      if (error) throw error;
      return (data ?? []) as DocsPageVersion[];
    },
    enabled: !!pageId,
  });
}
