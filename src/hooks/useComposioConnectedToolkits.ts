import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Which Composio toolkits have an ACTIVE connected account under entity
 * 'default' — the entity composio-proxy's execute path looks up.
 *
 * An integration that is delivered THROUGH Composio (Meta Ads, LinkedIn
 * publishing) has no vault secret of its own: it is "configured" when the
 * account is connected. This is the one reader of that fact for the admin UI;
 * the query key is shared with ComposioPanel so both see the same answer.
 *
 * Returns lower-cased toolkit slugs ('metaads', 'linkedin', 'gmail', …).
 */
export interface ComposioConnectedApp {
  name?: string;
  appName?: string;
  id?: string;
  status?: string;
  toolkit?: { slug?: string };
  toolkit_slug?: string;
}

export function toolkitSlugOf(app: ComposioConnectedApp): string {
  return String(app.toolkit?.slug || app.toolkit_slug || app.appName || app.name || '').toLowerCase();
}

export function useComposioConnectedApps() {
  return useQuery({
    queryKey: ['composio-connected-apps'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('composio-proxy', {
        body: { action: 'list_apps', entity_id: 'default' },
      });
      if (error) throw new Error(typeof error === 'object' ? (error as { message?: string })?.message || JSON.stringify(error) : String(error));
      const items = data?.result;
      const list: ComposioConnectedApp[] = Array.isArray(items) ? items : items?.items || [];
      return list.filter((a) => a.status === 'ACTIVE');
    },
    staleTime: 30 * 1000,
    retry: 1,
  });
}

export function useComposioConnectedToolkits(): { toolkits: string[]; isLoading: boolean } {
  const { data, isLoading } = useComposioConnectedApps();
  return { toolkits: (data ?? []).map(toolkitSlugOf).filter(Boolean), isLoading };
}
