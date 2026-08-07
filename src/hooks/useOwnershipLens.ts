/**
 * One lens for the whole CRM, and it follows the user — not the browser.
 *
 * Stored in profiles.preferences (key 'ownership_lens'), the same store the
 * pinned pages moved into after localStorage lost everyone's pins on the day
 * the instance got its real domain. Merge-written so it never clobbers a
 * sibling key, per the convention usePinnedPages established.
 *
 * ONE preference, not one per list: "Mina" is a mode of looking at the CRM,
 * and a salesperson who narrows their contacts almost always wants their
 * deals and quotes narrowed in the same glance. Defaults to 'all' — the
 * system's purpose is transparency; focus is the exception you opt into.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { OwnershipLens } from '@/lib/ownership';

const KEY = 'ownership_lens';

export function useOwnershipLens() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ['ownership-lens', user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<OwnershipLens> => {
      const { data: row } = await supabase
        .from('profiles' as never)
        .select('preferences')
        .eq('id', user!.id)
        .maybeSingle();
      const prefs = ((row as { preferences?: unknown } | null)?.preferences ?? {}) as Record<string, unknown>;
      return prefs[KEY] === 'mine' ? 'mine' : 'all';
    },
  });

  const setLens = useMutation({
    mutationFn: async (lens: OwnershipLens) => {
      const { data: row } = await supabase
        .from('profiles' as never)
        .select('preferences')
        .eq('id', user!.id)
        .maybeSingle();
      const prefs = ((row as { preferences?: unknown } | null)?.preferences ?? {}) as Record<string, unknown>;
      const { error } = await supabase
        .from('profiles' as never)
        .update({ preferences: { ...prefs, [KEY]: lens } } as never)
        .eq('id', user!.id);
      if (error) throw error;
      return lens;
    },
    onMutate: async (lens) => {
      // The toggle must feel instant; the write follows.
      qc.setQueryData(['ownership-lens', user?.id], lens);
    },
    onError: () => {
      qc.invalidateQueries({ queryKey: ['ownership-lens', user?.id] });
    },
  });

  return {
    lens: (data ?? 'all') as OwnershipLens,
    setLens: (l: OwnershipLens) => setLens.mutate(l),
    uid: user?.id ?? null,
  };
}
