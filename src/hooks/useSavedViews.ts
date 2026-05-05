import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const sb = supabase as unknown as { from: (t: string) => any; auth: typeof supabase.auth };

export interface SavedView<T = Record<string, unknown>> {
  id: string;
  user_id: string;
  scope: string;
  name: string;
  config: T;
  is_default: boolean;
  is_shared: boolean;
  created_at: string;
}

const key = (scope: string) => ['saved-views', scope] as const;

export function useSavedViews<T = Record<string, unknown>>(scope: string) {
  return useQuery({
    queryKey: key(scope),
    queryFn: async () => {
      const { data, error } = await sb
        .from('saved_views')
        .select('*')
        .eq('scope', scope)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as SavedView<T>[];
    },
  });
}

export function useCreateSavedView() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { scope: string; name: string; config: Record<string, unknown>; is_shared?: boolean; is_default?: boolean }) => {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) throw new Error('not authenticated');
      const { data, error } = await sb
        .from('saved_views')
        .insert({ ...input, user_id: user.id })
        .select()
        .single();
      if (error) throw error;
      return data as SavedView;
    },
    onSuccess: (row) => qc.invalidateQueries({ queryKey: key(row.scope) }),
  });
}

export function useDeleteSavedView() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; scope: string }) => {
      const { error } = await sb.from('saved_views').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: key(vars.scope) }),
  });
}
