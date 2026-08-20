import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Wiki pins — the handful of pages a colleague keeps at the top of the tree.
 *
 * Stored in profiles.preferences (jsonb, key 'wiki_pins'), the same store the
 * sidebar's pinned pages moved into after localStorage lost everyone's pins on
 * the day the instance got its real domain. Merge-written so it never clobbers
 * a sibling preference, per the convention usePinnedPages established.
 *
 * PER USER, not per workspace. A pin is not a claim about what matters to the
 * team — it is where *I* keep my hands. The team-level answer to "this page
 * matters" is the tree itself: parent it high, and everyone sees it. Making
 * pins shared would give one person's shortcut the weight of a decision.
 *
 * SLUGS ONLY. usePinnedPages stores {href, name, icon} and therefore shows a
 * stale name after a rename; here the slug is the key and the title is read
 * from the live page list every render, so a renamed page keeps its pin and
 * shows its new title. A pin whose page is gone resolves to nothing and simply
 * stops rendering — no ghost rows, no cleanup job.
 */

/** Same ceiling as the sidebar's pins: past a handful, a shortcut list is a
 *  second tree, and the tree is already there. */
const MAX_WIKI_PINS = 8;

export function useWikiPins(userId: string | undefined) {
  const qc = useQueryClient();
  const queryKey = ['wiki-pins', userId];

  const { data: pins = [] } = useQuery({
    queryKey,
    enabled: !!userId,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('preferences')
        .eq('id', userId!)
        .maybeSingle();
      if (error) throw error;
      const prefs = ((data as { preferences?: unknown } | null)?.preferences ?? {}) as {
        wiki_pins?: unknown;
      };
      return Array.isArray(prefs.wiki_pins)
        ? prefs.wiki_pins.filter((s): s is string => typeof s === 'string')
        : [];
    },
    staleTime: 60_000,
  });

  const write = useMutation({
    mutationFn: async (next: string[]) => {
      // Read-merge-write: a pin must never clobber a sibling preference written
      // by another surface (ownership_lens, pinned_pages, …).
      const { data } = await supabase
        .from('profiles')
        .select('preferences')
        .eq('id', userId!)
        .maybeSingle();
      const prefs = ((data as { preferences?: unknown } | null)?.preferences ?? {}) as Record<string, unknown>;
      const { error } = await supabase
        .from('profiles')
        .update({ preferences: { ...prefs, wiki_pins: next } } as never)
        .eq('id', userId!);
      if (error) throw error;
      return next;
    },
    onMutate: async (next) => {
      // The pin must land under the cursor, not after a round-trip.
      await qc.cancelQueries({ queryKey });
      const prev = qc.getQueryData<string[]>(queryKey);
      qc.setQueryData(queryKey, next);
      return { prev };
    },
    onError: (_e, _next, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKey, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey }),
  });

  const isPinned = useCallback((slug: string) => pins.includes(slug), [pins]);

  const toggle = useCallback(
    (slug: string) => {
      if (!userId) return;
      if (pins.includes(slug)) {
        write.mutate(pins.filter((s) => s !== slug));
        return;
      }
      if (pins.length >= MAX_WIKI_PINS) return;
      write.mutate([...pins, slug]);
    },
    [userId, pins, write],
  );

  return { pins, isPinned, toggle, atLimit: pins.length >= MAX_WIKI_PINS, maxPins: MAX_WIKI_PINS };
}
