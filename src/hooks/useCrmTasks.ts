import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';

export interface CrmTask {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  completed_at: string | null;
  /** Optional feedback captured when the task was marked done (Odoo done-with-feedback). */
  completion_note: string | null;
  priority: string;
  lead_id: string | null;
  deal_id: string | null;
  assigned_to: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export function useCrmTasks(options?: { leadId?: string; dealId?: string; showCompleted?: boolean }) {
  return useQuery({
    queryKey: ['crm-tasks', options],
    queryFn: async () => {
      let query = supabase
        .from('crm_tasks')
        .select('*')
        .order('due_date', { ascending: true, nullsFirst: false });

      if (options?.leadId) {
        query = query.eq('lead_id', options.leadId);
      }
      if (options?.dealId) {
        query = query.eq('deal_id', options.dealId);
      }
      if (!options?.showCompleted) {
        query = query.is('completed_at', null);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as CrmTask[];
    },
  });
}

export function useAllPendingTasks() {
  return useQuery({
    queryKey: ['crm-tasks', 'pending'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crm_tasks')
        .select('*')
        .is('completed_at', null)
        .order('due_date', { ascending: true, nullsFirst: false })
        .limit(50);

      if (error) throw error;
      return data as CrmTask[];
    },
  });
}

export function useCreateCrmTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (task: {
      title: string;
      description?: string;
      due_date?: string;
      priority?: string;
      lead_id?: string;
      deal_id?: string;
    }) => {
      const { data: userData } = await supabase.auth.getUser();

      const { data, error } = await supabase
        .from('crm_tasks')
        .insert([{
          ...task,
          created_by: userData.user?.id,
          assigned_to: userData.user?.id,
        }])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-tasks'] });
      toast.success('Task created');
    },
  });
}

export function useUpdateCrmTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<CrmTask> & { id: string }) => {
      const { data, error } = await supabase
        .from('crm_tasks')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-tasks'] });
    },
  });
}

export function useCompleteCrmTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, note }: { id: string; note?: string }) => {
      const { data, error } = await supabase
        .from('crm_tasks')
        .update({
          completed_at: new Date().toISOString(),
          completion_note: note?.trim() || null,
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      // Done-with-feedback (Odoo action_feedback pattern): post the completion
      // to the record's timeline so finished work is permanent history.
      // Deal-only tasks are logged on the deal's lead — that is where the
      // unified timeline lives.
      let timelineLeadId = data.lead_id as string | null;
      if (!timelineLeadId && data.deal_id) {
        const { data: deal } = await supabase
          .from('deals')
          .select('lead_id')
          .eq('id', data.deal_id)
          .maybeSingle();
        timelineLeadId = deal?.lead_id ?? null;
      }
      if (timelineLeadId) {
        const { error: actError } = await supabase.from('lead_activities').insert({
          lead_id: timelineLeadId,
          type: 'task_completed',
          metadata: {
            task_id: data.id,
            task_title: data.title,
            ...(data.deal_id ? { deal_id: data.deal_id } : {}),
            ...(note?.trim() ? { note: note.trim() } : {}),
          },
          points: 0,
        });
        // Timeline logging must never fail the completion itself.
        if (actError) logger.warn('task_completed timeline insert failed', actError);
      }

      return { ...data, timelineLeadId };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['crm-tasks'] });
      if (data.timelineLeadId) {
        queryClient.invalidateQueries({ queryKey: ['lead-activities', data.timelineLeadId] });
        queryClient.invalidateQueries({ queryKey: ['unified-timeline'] });
      }
      toast.success('Task completed');
    },
  });
}

export function useDeleteCrmTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('crm_tasks')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-tasks'] });
      toast.success('Task deleted');
    },
  });
}
