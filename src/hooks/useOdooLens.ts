/**
 * The Odoo lens — recognition for a team that moved in from Odoo.
 *
 * Shown only on an instance that has run `import_from_odoo` (there are
 * `import_links` rows with source 'odoo'), and only until the person dismisses
 * it. The dismissal lives in profiles.preferences (key 'dismissed_hints'), the
 * same store as the ownership lens and the pinned pages, so it follows the
 * user rather than the browser.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

const HINTS_KEY = 'dismissed_hints';

export function useOdooImportPresence() {
  return useQuery({
    queryKey: ['odoo-import-presence'],
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<boolean> => {
      const { count, error } = await supabase
        .from('import_links' as never)
        .select('external_id', { count: 'exact', head: true })
        .eq('source', 'odoo');
      if (error) throw error;
      return (count ?? 0) > 0;
    },
  });
}

export function useDismissedHints() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const key = ['dismissed-hints', user?.id];

  const query = useQuery({
    queryKey: key,
    enabled: !!user?.id,
    queryFn: async (): Promise<string[]> => {
      const { data: row, error } = await supabase
        .from('profiles' as never)
        .select('preferences')
        .eq('id', user!.id)
        .maybeSingle();
      if (error) throw error;
      const prefs = ((row as { preferences?: unknown } | null)?.preferences ?? {}) as Record<string, unknown>;
      const list = prefs[HINTS_KEY];
      return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : [];
    },
  });

  const dismiss = useMutation({
    mutationFn: async (hintId: string) => {
      const { data: row, error: readErr } = await supabase
        .from('profiles' as never)
        .select('preferences')
        .eq('id', user!.id)
        .maybeSingle();
      if (readErr) throw readErr;
      const prefs = ((row as { preferences?: unknown } | null)?.preferences ?? {}) as Record<string, unknown>;
      const current = Array.isArray(prefs[HINTS_KEY]) ? (prefs[HINTS_KEY] as unknown[]).filter((x): x is string => typeof x === 'string') : [];
      const next = current.includes(hintId) ? current : [...current, hintId];
      const { error } = await supabase
        .from('profiles' as never)
        .update({ preferences: { ...prefs, [HINTS_KEY]: next } } as never)
        .eq('id', user!.id);
      if (error) throw error;
      return next;
    },
    onMutate: async (hintId) => {
      const prev = (qc.getQueryData(key) as string[] | undefined) ?? [];
      qc.setQueryData(key, prev.includes(hintId) ? prev : [...prev, hintId]);
    },
    onError: () => { qc.invalidateQueries({ queryKey: key }); },
  });

  return {
    dismissed: query.data ?? [],
    isDismissed: (hintId: string) => (query.data ?? []).includes(hintId),
    dismiss: (hintId: string) => dismiss.mutate(hintId),
  };
}
