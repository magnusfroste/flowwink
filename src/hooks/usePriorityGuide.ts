import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export type Priority = (typeof PRIORITIES)[number];
export type PriorityGuide = Record<Priority, string>;

/**
 * What low/medium/high/urgent mean on this instance. The database owns the
 * words (defaults, with the team's own on top — project_priority_guide); the
 * picker shows them under each option, and the agent reads the same text in
 * project_attention and the brief. No meaning is written in the browser.
 */
export function usePriorityGuide() {
  return useQuery({
    queryKey: ['project_priority_guide'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('project_priority_guide' as never);
      if (error) throw error;
      return data as unknown as PriorityGuide;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useSetPriorityGuide() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (guide: Partial<PriorityGuide>) => {
      const { data, error } = await supabase.rpc('set_project_priority_guide' as never, { p_guide: guide } as never);
      if (error) throw error;
      const answer = data as unknown as { success: boolean; error?: string; priority_guide?: PriorityGuide };
      if (!answer.success) throw new Error(answer.error ?? 'The guide could not be saved');
      return answer.priority_guide!;
    },
    onSuccess: (guide) => {
      qc.setQueryData(['project_priority_guide'], guide);
      qc.invalidateQueries({ queryKey: ['project_task_stats'] });
      toast.success('Priority guide saved');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
