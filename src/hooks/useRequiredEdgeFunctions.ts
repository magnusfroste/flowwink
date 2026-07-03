import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * The set of edge functions this instance *needs* — derived from the enabled
 * `agent_skills` rows whose handler starts with `edge:`. Base function name is
 * extracted (e.g. `edge:newsletter/send` → `newsletter-send` is not implied;
 * the base is `newsletter`) — Supabase deploys per top-level function slug and
 * routes subpaths inside, so we compare on the first segment.
 *
 * Feeds the Deploy Status drift check: "which required functions are NOT in
 * the last deploy manifest?".
 */
export function useRequiredEdgeFunctions() {
  return useQuery({
    queryKey: ['required-edge-functions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agent_skills')
        .select('handler')
        .eq('enabled', true)
        .like('handler', 'edge:%');
      if (error) throw error;

      const bases = new Set<string>();
      for (const row of data ?? []) {
        const h = (row as { handler: string }).handler ?? '';
        const raw = h.slice(5); // strip `edge:`
        // Supabase deploys per top-level function; anything after `/` is an
        // internal route on that function.
        const base = raw.split('/')[0];
        if (base) bases.add(base);
      }
      return Array.from(bases).sort();
    },
    staleTime: 60_000,
  });
}
