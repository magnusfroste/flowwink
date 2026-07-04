import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { isPast, isToday, parseISO } from 'date-fns';

export interface NextTaskInfo {
  id: string;
  title: string;
  due_date: string | null;
}

/** Odoo-style activity state computed from the deadline. */
export type NextStepState = 'overdue' | 'today' | 'planned' | 'none';

export function getNextStepState(task: NextTaskInfo | undefined): NextStepState {
  if (!task) return 'none';
  if (!task.due_date) return 'planned';
  const due = parseISO(task.due_date);
  if (isToday(due)) return 'today';
  if (isPast(due)) return 'overdue';
  return 'planned';
}

/**
 * One query for ALL open crm_tasks → next task per lead and per deal.
 * Powers the next-activity chips on LeadKanban/DealKanban without N+1
 * per-card queries. Tasks are ordered by due_date (undated last), so the
 * first task seen per record is its nearest next step.
 *
 * Shares the 'crm-tasks' queryKey prefix so task create/complete mutations
 * invalidate this index automatically.
 */
export function useNextTasksIndex() {
  return useQuery({
    queryKey: ['crm-tasks', 'next-index'],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crm_tasks')
        .select('id, title, due_date, lead_id, deal_id')
        .is('completed_at', null)
        .order('due_date', { ascending: true, nullsFirst: false })
        .limit(2000);

      if (error) throw error;

      const byLead = new Map<string, NextTaskInfo>();
      const byDeal = new Map<string, NextTaskInfo>();
      for (const row of data ?? []) {
        const info: NextTaskInfo = { id: row.id, title: row.title, due_date: row.due_date };
        if (row.lead_id && !byLead.has(row.lead_id)) byLead.set(row.lead_id, info);
        if (row.deal_id && !byDeal.has(row.deal_id)) byDeal.set(row.deal_id, info);
      }
      return { byLead, byDeal };
    },
  });
}
