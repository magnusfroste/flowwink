import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface ProjectMilestone {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  due_date: string | null;
  sort_order: number | null;
  is_reached: boolean;
  reached_at: string | null;
  created_at: string;
  updated_at: string;
}

export function useProjectMilestones(projectId?: string) {
  return useQuery({
    queryKey: ['project_milestones', projectId],
    enabled: !!projectId,
    queryFn: async (): Promise<ProjectMilestone[]> => {
      const { data, error } = await supabase.rpc('manage_project_milestone' as any, {
        p_action: 'list',
        p_project_id: projectId,
      });
      if (error) throw error;
      return ((data as any)?.milestones ?? []) as ProjectMilestone[];
    },
  });
}

interface MilestoneInput {
  p_milestone_id?: string;
  p_project_id?: string;
  p_name?: string;
  p_description?: string | null;
  p_due_date?: string | null;
  p_sort_order?: number | null;
}

function useMilestoneAction(action: 'create' | 'update' | 'reach' | 'reopen' | 'delete', successMsg: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: MilestoneInput) => {
      const { data, error } = await supabase.rpc('manage_project_milestone' as any, {
        p_action: action,
        p_milestone_id: input.p_milestone_id ?? null,
        p_project_id: input.p_project_id ?? null,
        p_name: input.p_name ?? null,
        p_description: input.p_description ?? null,
        p_due_date: input.p_due_date ?? null,
        p_sort_order: input.p_sort_order ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project_milestones'] });
      toast.success(successMsg);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export const useCreateProjectMilestone = () => useMilestoneAction('create', 'Milestone created');
export const useUpdateProjectMilestone = () => useMilestoneAction('update', 'Milestone updated');
export const useReachProjectMilestone = () => useMilestoneAction('reach', 'Milestone marked reached');
export const useReopenProjectMilestone = () => useMilestoneAction('reopen', 'Milestone reopened');
export const useDeleteProjectMilestone = () => useMilestoneAction('delete', 'Milestone deleted');
