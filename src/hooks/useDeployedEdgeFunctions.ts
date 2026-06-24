import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Reads the list of edge functions actually deployed on this instance.
 *
 * `flowwink.sh /update-funcs` writes the deployed function slugs to
 * `site_settings` (key `edge_functions_deployed`) after each deploy. The
 * Modules page compares this against the functions the enabled modules require,
 * so it can warn "module enabled but its edge function isn't deployed — run
 * /update-funcs". The UI cannot deploy functions itself, so this is the signal.
 *
 * Returns `functions: null` when the key is absent (never deployed via the
 * current script) — the UI then shows a neutral "status unknown" hint rather
 * than a false "missing" alarm.
 */
export interface DeployedEdgeFunctions {
  functions: string[] | null;
  updatedAt: string | null;
}

export function useDeployedEdgeFunctions() {
  return useQuery<DeployedEdgeFunctions>({
    queryKey: ['site-settings', 'edge_functions_deployed'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', 'edge_functions_deployed')
        .maybeSingle();
      if (error) throw error;

      const value = (data?.value ?? null) as
        | { functions?: string[]; updated_at?: string }
        | string[]
        | null;

      if (Array.isArray(value)) return { functions: value, updatedAt: null };
      return {
        functions: Array.isArray(value?.functions) ? value!.functions : null,
        updatedAt: value?.updated_at ?? null,
      };
    },
    staleTime: 60_000,
  });
}
