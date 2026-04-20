import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface StaleDeal {
  deal_id: string;
  stage: string;
  value_cents: number;
  currency: string;
  lead_id: string;
  product_name: string | null;
  expected_close: string | null;
  days_idle: number;
  recommendation: string;
}

export interface StaleDealsResult {
  threshold_days: number;
  stale_count: number;
  total_value_at_risk_cents: number;
  deals: StaleDeal[];
}

/**
 * Calls the `deal_stale_check` skill via agent-execute (MCP-exposed).
 * Works regardless of FlowPilot module being enabled.
 */
export function useStaleDeals(daysThreshold = 14) {
  return useQuery({
    queryKey: ['stale-deals', daysThreshold],
    queryFn: async (): Promise<StaleDealsResult> => {
      const { data, error } = await supabase.functions.invoke('agent-execute', {
        body: {
          skill: 'deal_stale_check',
          args: { days_threshold: daysThreshold },
        },
      });
      if (error) throw error;
      // agent-execute wraps results — handle both shapes
      return (data?.result || data) as StaleDealsResult;
    },
    staleTime: 5 * 60 * 1000,
  });
}
