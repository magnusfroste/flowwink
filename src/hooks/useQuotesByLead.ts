import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface LeadQuoteSummary {
  id: string;
  quote_number: string;
  title: string | null;
  status: string;
  total_cents: number;
  currency: string;
  valid_until: string | null;
  created_at: string;
}

/** Open (not yet decided) quotes for a lead — "what have we quoted". */
export function useOpenQuotesByLead(leadId: string | undefined) {
  return useQuery({
    queryKey: ['quotes', 'by-lead-open', leadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quotes')
        .select('id, quote_number, title, status, total_cents, currency, valid_until, created_at')
        .eq('lead_id', leadId!)
        .not('status', 'in', '(accepted,rejected,expired,cancelled)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as LeadQuoteSummary[];
    },
    enabled: !!leadId,
  });
}
