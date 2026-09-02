import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface PinnedPage {
  href: string;
  name: string;
  icon: string; // lucide icon name stored as string
}

const MAX_PINS = 8;

/**
 * Pinned pages live in profiles.preferences (jsonb, key 'pinned_pages') — the
 * database, not localStorage. The old implementation was "persistent per
 * user" only per browser per ORIGIN: the day the instance moved to its real
 * domain, every user's pins vanished with the old origin's storage.
 *
 * The old localStorage value is read ONCE as a migration seed: a user on the
 * same origin keeps their pins; a user on a new origin starts clean (the old
 * origin's storage is unreachable by design — nothing to migrate from).
 */
function legacySeed(userId: string): PinnedPage[] {
  try {
    const stored = localStorage.getItem(`flowwink-pinned-${userId}`);
    return stored ? (JSON.parse(stored) as PinnedPage[]) : [];
  } catch {
    return [];
  }
}

export function usePinnedPages(userId: string | undefined) {
  const qc = useQueryClient();
  const queryKey = ['pinned-pages', userId];

  const { data: pins = [] } = useQuery({
    queryKey,
    enabled: !!userId,
    queryFn: async (): Promise<PinnedPage[]> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('preferences')
        .eq('id', userId!)
        .maybeSingle();
      if (error) throw error;
      const prefs = ((data as { preferences?: unknown } | null)?.preferences ?? {}) as { pinned_pages?: PinnedPage[] };
      if (Array.isArray(prefs.pinned_pages)) return prefs.pinned_pages;

      // First run after the storage move: seed from same-origin localStorage
      // so nobody on the original domain loses their pins in the migration.
      const seed = legacySeed(userId!);
      if (seed.length > 0) {
        await supabase
          .from('profiles')
          .update({ preferences: { ...prefs, pinned_pages: seed } } as never)
          .eq('id', userId!);
      }
      return seed;
    },
    staleTime: 60_000,
  });

  const write = useMutation({
    mutationFn: async (next: PinnedPage[]) => {
      // Merge into the preferences object — pins must never clobber a future
      // sibling preference written by another surface.
      const { data } = await supabase
        .from('profiles')
        .select('preferences')
        .eq('id', userId!)
        .maybeSingle();
      const prefs = ((data as { preferences?: unknown } | null)?.preferences ?? {}) as Record<string, unknown>;
      const { error } = await supabase
        .from('profiles')
        .update({ preferences: { ...prefs, pinned_pages: next } } as never)
        .eq('id', userId!);
      if (error) throw error;
      return next;
    },
    onMutate: async (next) => {
      // Optimistic: the sidebar star should not wait for a round-trip.
      await qc.cancelQueries({ queryKey });
      const prev = qc.getQueryData<PinnedPage[]>(queryKey);
      qc.setQueryData(queryKey, next);
      return { prev };
    },
    onError: (_e, _next, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKey, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey }),
  });

  const addPin = useCallback(
    (page: PinnedPage) => {
      if (!userId) return;
      if (pins.length >= MAX_PINS) return;
      if (pins.some((p) => p.href === page.href)) return;
      write.mutate([...pins, page]);
    },
    [userId, pins, write],
  );

  const removePin = useCallback(
    (href: string) => {
      if (!userId) return;
      write.mutate(pins.filter((p) => p.href !== href));
    },
    [userId, pins, write],
  );

  const isPinned = useCallback(
    (href: string) => pins.some((p) => p.href === href),
    [pins],
  );

  /**
   * Reorder — the header's drag-and-drop. Order IS the array; nothing new is
   * stored. Refused when the set differs (a stale drag after a pin/unpin
   * elsewhere must not resurrect or drop a pin).
   */
  const reorderPins = useCallback(
    (next: PinnedPage[]) => {
      if (!userId) return;
      if (!sameSet(pins, next)) return;
      write.mutate(next);
    },
    [userId, pins, write],
  );

  return { pins, addPin, removePin, isPinned, reorderPins };
}

/** Same pins, any order. */
export function sameSet(a: PinnedPage[], b: PinnedPage[]): boolean {
  if (a.length !== b.length) return false;
  const hrefs = new Set(a.map((p) => p.href));
  return b.every((p) => hrefs.has(p.href));
}

/** Pure move used by the header: item at `from` lands at `to`. */
export function movePin(pins: PinnedPage[], from: number, to: number): PinnedPage[] {
  if (from === to || from < 0 || to < 0 || from >= pins.length || to >= pins.length) return pins;
  const next = pins.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}
