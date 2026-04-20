import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Quote } from '@/hooks/useQuotes';

/**
 * List quotes attached to a specific Deal (Odoo-style Deal → Quote relationship).
 */
export function useQuotesByDeal(dealId: string | undefined) {
  return useQuery({
    queryKey: ['quotes', 'by-deal', dealId],
    queryFn: async () => {
      if (!dealId) return [];
      const { data, error } = await supabase
        .from('quotes')
        .select('*, leads(id, name, email, company_id, companies(name))')
        .eq('deal_id', dealId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as Quote[];
    },
    enabled: !!dealId,
  });
}
