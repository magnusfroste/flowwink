import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

/**
 * The unified trash — one list of everything deleted, across modules.
 *
 * Revision history can already undo a deletion; what it cannot do is help you
 * FIND the thing, because it wants a slug or a revision id and you remember
 * neither. This reads the traces deletion already leaves and shows a preview,
 * so you recognise the item instead of having to name it.
 *
 * Every source, gate and column lives in the `trash_sources` registry table —
 * see supabase/migrations/20260824120000_a8b9c0d1-recognition-beats-recall.sql.
 * Nothing here branches on a content type, and adding one is an INSERT there.
 */

export interface TrashItem {
  source: string;
  label: string;
  item_key: string;
  revision_id: string | null;
  title: string | null;
  subtitle: string | null;
  preview: string | null;
  deleted_at: string;
  deleted_by: string | null;
  deleted_by_name: string | null;
}

export interface TrashSource {
  source: string;
  label: string;
  module: string;
  /** False when the module's own history RPC would refuse this caller. */
  can_restore: boolean;
  can_purge: boolean;
}

export interface TrashBin {
  sources: TrashSource[];
  items: TrashItem[];
}

const TRASH_KEY = ['trash'] as const;

interface TrashArgs {
  p_action: string;
  p_source?: string | null;
  p_key?: string | null;
  p_revision_id?: string | null;
  p_search?: string | null;
  p_limit?: number;
}

async function callTrashBin<T>(args: TrashArgs): Promise<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await supabase.rpc('trash_bin' as any, args as any);
  if (error) throw error;
  return data as T;
}

export function useTrashBin(options?: { source?: string | null; search?: string }) {
  const { loading: authLoading, session } = useAuth();
  const source = options?.source ?? null;
  const search = options?.search?.trim() || null;

  return useQuery({
    queryKey: [...TRASH_KEY, source ?? 'all', search ?? '', session?.user?.id ?? 'anon'],
    queryFn: async (): Promise<TrashBin> => {
      const data = await callTrashBin<{ sources?: TrashSource[]; items?: TrashItem[] }>({
        p_action: 'list',
        p_source: source,
        p_search: search,
        p_limit: 200,
      });
      return { sources: data?.sources ?? [], items: data?.items ?? [] };
    },
    enabled: !authLoading && !!session,
  });
}

export function useRestoreFromTrash() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (item: TrashItem) =>
      callTrashBin<{ success?: boolean }>({
        p_action: 'restore',
        p_source: item.source,
        p_key: item.item_key,
        p_revision_id: item.revision_id,
      }),
    onSuccess: (_data, item) => {
      queryClient.invalidateQueries({ queryKey: TRASH_KEY });
      // The restored item reappears in its own module's lists.
      queryClient.invalidateQueries({ queryKey: ['pages'] });
      queryClient.invalidateQueries({ queryKey: ['deleted-pages'] });
      queryClient.invalidateQueries({ queryKey: ['wiki-pages'] });
      queryClient.invalidateQueries({ queryKey: ['kb-articles'] });
      toast.success(`${item.title || item.label} restored`);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function usePurgeFromTrash() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (item: TrashItem) =>
      callTrashBin<{ rows_deleted?: number; rows_remaining?: number }>({
        p_action: 'purge',
        p_source: item.source,
        p_key: item.item_key,
      }),
    onSuccess: (data, item) => {
      queryClient.invalidateQueries({ queryKey: TRASH_KEY });
      // Say what actually went, counted by the database after the delete —
      // a purge that reported success while rows survived would be the exact
      // lie this feature exists to avoid.
      const n = data?.rows_deleted ?? 0;
      toast.success(
        `${item.title || item.label} permanently deleted`,
        { description: `${n} stored ${n === 1 ? 'revision' : 'revisions'} removed. This cannot be undone.` },
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
