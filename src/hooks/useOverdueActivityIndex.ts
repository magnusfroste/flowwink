import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Returns Sets of lead_ids and deal_ids that have at least one
 * overdue (due_date < now, not completed) crm_task.
 * Used to color-code list rows red ("needs attention").
 */
export function useOverdueActivityIndex() {
  return useQuery({
    queryKey: ['crm-tasks', 'overdue-index'],
    staleTime: 60_000,
    queryFn: async () => {
      const nowIso = new Date().toISOString();
      const { data, error } = await supabase
        .from('crm_tasks')
        .select('lead_id, deal_id, due_date')
        .is('completed_at', null)
        .not('due_date', 'is', null)
        .lt('due_date', nowIso)
        .limit(2000);

      if (error) throw error;

      const leadIds = new Set<string>();
      const dealIds = new Set<string>();
      for (const row of data ?? []) {
        if (row.lead_id) leadIds.add(row.lead_id);
        if (row.deal_id) dealIds.add(row.deal_id);
      }
      return { leadIds, dealIds };
    },
  });
}
