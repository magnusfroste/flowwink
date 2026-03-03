import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { AgentObjective } from '@/types/agent';

const QUERY_KEY = ['agent-objectives'];

export function useObjectives(statusFilter?: string) {
  return useQuery({
    queryKey: [...QUERY_KEY, statusFilter],
    queryFn: async () => {
      let q = supabase
        .from('agent_objectives')
        .select('*')
        .order('created_at', { ascending: false });

      if (statusFilter && statusFilter !== 'all') {
        q = q.eq('status', statusFilter as any);
      }

      const { data, error } = await q;
      if (error) throw error;
      return data as unknown as AgentObjective[];
    },
  });
}

export function useObjectiveActivities(objectiveId: string | null) {
  return useQuery({
    queryKey: ['agent-objective-activities', objectiveId],
    enabled: !!objectiveId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agent_objective_activities')
        .select('activity_id, created_at')
        .eq('objective_id', objectiveId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useUpsertObjective() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (obj: Partial<AgentObjective> & { goal: string }) => {
      const payload = {
        goal: obj.goal,
        status: obj.status ?? 'active',
        constraints: obj.constraints ?? {},
        success_criteria: obj.success_criteria ?? {},
        progress: obj.progress ?? {},
        created_by: obj.created_by ?? null,
      };

      if (obj.id) {
        const { error } = await supabase
          .from('agent_objectives')
          .update(payload as any)
          .eq('id', obj.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('agent_objectives')
          .insert(payload as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success('Objective saved');
    },
    onError: () => toast.error('Failed to save objective'),
  });
}

export function useDeleteObjective() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('agent_objectives')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success('Objective deleted');
    },
    onError: () => toast.error('Failed to delete objective'),
  });
}

export function useUpdateObjectiveStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const update: any = { status };
      if (status === 'completed') update.completed_at = new Date().toISOString();
      const { error } = await supabase
        .from('agent_objectives')
        .update(update)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success('Status updated');
    },
    onError: () => toast.error('Failed to update status'),
  });
}
