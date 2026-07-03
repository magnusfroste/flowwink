import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Comm } from '@/components/admin/communications/CommunicationDetailDialog';

/**
 * Emails linked to a lead via outbound_communications.related_entity_*
 * (set by the associate_comm_with_lead DB trigger for all writers).
 */
export function useLeadCommunications(leadId: string | undefined) {
  return useQuery({
    queryKey: ['lead-communications', leadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('outbound_communications')
        .select('*')
        .eq('related_entity_type', 'lead')
        .eq('related_entity_id', leadId!)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as Comm[];
    },
    enabled: !!leadId,
  });
}
