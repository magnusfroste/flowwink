import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { AgentAutomation } from '@/types/agent';

const QUERY_KEY = ['agent-automations'];

export function useAutomations() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agent_automations')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as unknown as AgentAutomation[];
    },
  });
}

export function useUpsertAutomation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (auto: Partial<AgentAutomation> & { name: string }) => {
      const payload = {
        name: auto.name,
        description: auto.description ?? null,
        trigger_type: auto.trigger_type ?? 'cron',
        trigger_config: auto.trigger_config ?? {},
        skill_id: auto.skill_id ?? null,
        skill_name: auto.skill_name ?? null,
        skill_arguments: auto.skill_arguments ?? {},
        enabled: auto.enabled ?? true,
        created_by: auto.created_by ?? null,
      };

      if (auto.id) {
        const { error } = await supabase
          .from('agent_automations')
          .update(payload as any)
          .eq('id', auto.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('agent_automations')
          .insert(payload as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success('Automation saved');
    },
    onError: () => toast.error('Failed to save automation'),
  });
}

export function useToggleAutomation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { error } = await supabase
        .from('agent_automations')
        .update({ enabled } as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success('Automation updated');
    },
    onError: () => toast.error('Failed to toggle automation'),
  });
}

export function useDeleteAutomation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('agent_automations')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success('Automation deleted');
    },
    onError: () => toast.error('Failed to delete automation'),
  });
}
