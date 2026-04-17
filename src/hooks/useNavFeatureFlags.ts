import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Reads feature-flag site_settings rows used by adminNavigation items.
 * Returns a flat map keyed `<settingKey>.<field>` so navigation can do
 * `flags['dunning.enabled']`.
 *
 * Add new keys here as more nav items get a `featureFlag`.
 */
const TRACKED_KEYS = ['dunning'] as const;

export function useNavFeatureFlags() {
  return useQuery({
    queryKey: ['nav-feature-flags'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('site_settings')
        .select('key, value')
        .in('key', TRACKED_KEYS as unknown as string[]);
      if (error) throw error;
      const flags: Record<string, unknown> = {};
      (data ?? []).forEach((row) => {
        const v = row.value as Record<string, unknown> | null;
        if (v && typeof v === 'object') {
          Object.entries(v).forEach(([field, value]) => {
            flags[`${row.key}.${field}`] = value;
          });
        }
      });
      return flags;
    },
    staleTime: 60 * 1000,
  });
}

export function isFeatureFlagOn(
  flags: Record<string, unknown> | undefined,
  flag: string | undefined,
): boolean {
  if (!flag) return true;
  if (!flags) return false;
  return Boolean(flags[flag]);
}
