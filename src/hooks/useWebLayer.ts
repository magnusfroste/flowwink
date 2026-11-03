import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { WebCapability, WebProviderId } from '../../supabase/functions/_shared/web/order';
import { describeWebContext } from '../../supabase/functions/_shared/web/state';
import { useAuth } from '@/hooks/useAuth';
import { useIntegrationStatus } from '@/hooks/useIntegrationStatus';

/** One provider as web_providers_status (describeWebLayer) answers it. */
export interface WebProviderRow {
  id: WebProviderId;
  label: string;
  capabilities: WebCapability[];
  available: boolean;
  reason?: string;
  last_ok_at?: string | null;
  last_error_at?: string | null;
  last_error?: string | null;
  base_url?: string;
  self_hosted?: boolean;
  url?: string | null;
}

export interface WebLayerState {
  search: { order: WebProviderId[]; chain: WebProviderId[] };
  read: { order: WebProviderId[]; chain: WebProviderId[] };
  providers: WebProviderRow[];
}

/**
 * The web layer in force — the same answer an agent gets from
 * web_providers_status: per capability the configured order and the chain
 * the next search or read will try, per provider whether it is in use.
 *
 * An admin asks the skill (it sees the secrets). Anyone else computes the
 * same answer here with the same pure rule (_shared/web/state.ts) from what
 * staff may read: the settings rows and check-secrets' presence booleans.
 * web_providers_status is a platform skill — admin-only — and asking it as a
 * salesperson answered the Sales Intelligence readiness card with a 403
 * (role sweep, 2026-11-02).
 */
export function useWebLayer() {
  const { isAdmin, rolesReady } = useAuth();
  const { data: secrets } = useIntegrationStatus();
  return useQuery({
    queryKey: ['web-layer', isAdmin ? 'admin' : 'staff', !!secrets?.integrations.firecrawl, !!secrets?.integrations.jina],
    enabled: rolesReady && (isAdmin || !!secrets),
    queryFn: async (): Promise<WebLayerState> => {
      if (isAdmin) {
        const { data, error } = await supabase.functions.invoke('agent-execute', {
          body: { skill_name: 'web_providers_status', arguments: {}, agent_type: 'flowpilot' },
        });
        if (error) throw error;
        return (data?.result ?? data) as WebLayerState;
      }
      const { data: rows, error } = await supabase.from('site_settings').select('key, value')
        .in('key', ['integrations', 'web_layer', 'web_provider_status']);
      if (error) throw error;
      const get = (k: string) => ((rows ?? []).find((r) => r.key === k)?.value ?? {}) as Record<string, never>;
      return describeWebContext({
        integrations: get('integrations'),
        webLayer: get('web_layer'),
        status: get('web_provider_status'),
        keys: { firecrawl: !!secrets?.integrations.firecrawl, jina: !!secrets?.integrations.jina },
      }) as WebLayerState;
    },
    staleTime: 60_000,
  });
}
