import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ValuationProduct {
  product_id: string;
  name: string;
  on_hand_qty: number;
  value_cents: number;
  avg_unit_cost_cents: number;
}

export interface ValuationReport {
  total_value_cents: number;
  products: ValuationProduct[];
}

export function useInventoryValuation(limit = 500) {
  return useQuery({
    queryKey: ['inventory-valuation', limit],
    queryFn: async (): Promise<ValuationReport> => {
      const { data, error } = await supabase.rpc(
        'inventory_valuation_report' as never,
        { p_limit: limit } as never,
      );
      if (error) throw error;
      const r = (data ?? {}) as Partial<ValuationReport>;
      return {
        total_value_cents: r.total_value_cents ?? 0,
        products: r.products ?? [],
      };
    },
  });
}
