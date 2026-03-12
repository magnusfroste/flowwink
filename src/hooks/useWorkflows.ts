import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { AgentWorkflow } from '@/types/agent';

const KEY = ['agent-workflows'];

export function useWorkflows() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agent_workflows')
        .select('*')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as AgentWorkflow[];
    },
  });
}

export function useUpsertWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (wf: Partial<AgentWorkflow> & { name: string }) => {
      const payload = {
        name: wf.name,
        description: wf.description ?? null,
        steps: (wf.steps ?? []) as any,
        trigger_type: wf.trigger_type ?? 'manual',
        trigger_config: (wf.trigger_config ?? {}) as any,
        enabled: wf.enabled ?? true,
      };

      if (wf.id) {
        const { error } = await supabase
          .from('agent_workflows')
          .update(payload)
          .eq('id', wf.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('agent_workflows')
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      toast.success('Workflow saved');
    },
    onError: () => toast.error('Failed to save workflow'),
  });
}

export function useToggleWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { error } = await supabase
        .from('agent_workflows')
        .update({ enabled })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
    onError: () => toast.error('Failed to toggle workflow'),
  });
}

export function useDeleteWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('agent_workflows')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      toast.success('Workflow deleted');
    },
    onError: () => toast.error('Failed to delete workflow'),
  });
}
