import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface StaleDeal {
  deal_id: string;
  stage: string;
  value_cents: number;
  currency: string;
  lead_id: string;
  product_name: string | null;
  contact_name: string | null;
  company_name: string | null;
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
 * agent-execute answers a FAILED skill with HTTP 200 and an envelope —
 * { status: 'failed', result: { error } } — so `error` above stays null. The
 * old `data?.result || data` handed that envelope to the card as if it were
 * the result, and `data.deals.length` threw: the Deals page rendered for a
 * moment and then died (optic 2026-10-07, a handler ReferenceError behind it).
 * A failure is an error, and a result without a deals list is one too.
 */
export function readStaleDealsResult(data: unknown): StaleDealsResult {
  const env = (data ?? {}) as { status?: string; error?: string; result?: unknown };
  const inner = (env.result ?? env) as { status?: string; error?: string; deals?: unknown };
  const failure = env.status === 'failed' ? (inner.error ?? env.error) : inner.status === 'failed' ? inner.error : undefined;
  if (failure || env.status === 'failed' || inner.status === 'failed') {
    throw new Error(`deal_stale_check failed: ${failure ?? 'unknown error'}`);
  }
  if (!Array.isArray(inner.deals)) {
    throw new Error('deal_stale_check returned no deals list');
  }
  return inner as StaleDealsResult;
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
          skill_name: 'deal_stale_check',
          arguments: { stale_days: daysThreshold },
          agent_type: 'flowpilot',
        },
      });
      if (error) throw error;
      return readStaleDealsResult(data);
    },
    staleTime: 5 * 60 * 1000,
  });
}
