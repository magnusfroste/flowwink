import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export type TaskStatus = 'todo' | 'in_progress' | 'review' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface ProjectTask {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assigned_to: string | null;
  due_date: string | null;
  estimated_hours: number | null;
  sort_order: number;
  completed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  projects?: { name: string; color: string | null };
  profiles?: { full_name: string | null; email: string | null };
}

export const TASK_STATUSES: { value: TaskStatus; label: string; color: string }[] = [
  { value: 'todo', label: 'To Do', color: 'bg-muted' },
  { value: 'in_progress', label: 'In Progress', color: 'bg-blue-500/10' },
  { value: 'review', label: 'Review', color: 'bg-amber-500/10' },
  { value: 'done', label: 'Done', color: 'bg-green-500/10' },
];

export function useProjectTasks(projectId?: string) {
  return useQuery({
    queryKey: ['project-tasks', projectId],
    queryFn: async () => {
      let query = supabase
        .from('project_tasks')
        .select('*, projects(name, color), profiles!project_tasks_assigned_to_fkey(full_name, email)')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false });

      if (projectId) {
        query = query.eq('project_id', projectId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as ProjectTask[];
    },
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (input: {
      project_id: string;
      title: string;
      description?: string;
      priority?: TaskPriority;
      assigned_to?: string;
      due_date?: string;
      estimated_hours?: number;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('project_tasks')
        .insert([{
          project_id: input.project_id,
          title: input.title,
          description: input.description || null,
          priority: input.priority || 'medium',
          assigned_to: input.assigned_to || null,
          due_date: input.due_date || null,
          estimated_hours: input.estimated_hours || null,
          created_by: user.id,
        }])
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project-tasks'] });
      toast({ title: 'Task created' });
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<{
      title: string;
      description: string | null;
      status: TaskStatus;
      priority: TaskPriority;
      assigned_to: string | null;
      due_date: string | null;
      estimated_hours: number | null;
      sort_order: number;
    }>) => {
      const { data, error } = await supabase
        .from('project_tasks')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project-tasks'] });
    },
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('project_tasks')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project-tasks'] });
      toast({ title: 'Task deleted' });
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });
}
