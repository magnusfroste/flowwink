import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { WebCapability, WebProviderId } from '../../supabase/functions/_shared/web/order';

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
 */
export function useWebLayer() {
  return useQuery({
    queryKey: ['web-layer'],
    queryFn: async (): Promise<WebLayerState> => {
      const { data, error } = await supabase.functions.invoke('agent-execute', {
        body: { skill_name: 'web_providers_status', arguments: {}, agent_type: 'flowpilot' },
      });
      if (error) throw error;
      return (data?.result ?? data) as WebLayerState;
    },
    staleTime: 60_000,
  });
}
