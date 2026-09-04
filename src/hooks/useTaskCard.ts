import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/** One entry in a task's thread — a person's note, an agent's step or question. */
export interface TaskComment {
  id: string;
  task_id: string;
  body: string;
  kind: 'comment' | 'step' | 'question' | 'decision';
  author_type: 'person' | 'flowpilot' | 'agent';
  author_id: string | null;
  author_name: string | null;
  created_at: string;
}

export function useTaskComments(taskId: string | null) {
  return useQuery({
    queryKey: ['task-comments', taskId],
    enabled: !!taskId,
    queryFn: async (): Promise<TaskComment[]> => {
      const { data, error } = await supabase
        .from('project_task_comments' as never)
        .select('id, task_id, body, kind, author_type, author_id, author_name, created_at')
        .eq('task_id', taskId!)
        .order('created_at', { ascending: true })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as TaskComment[];
    },
  });
}

export function useAddTaskComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { task_id: string; project_id: string; body: string; kind?: TaskComment['kind']; author_id?: string | null; author_name?: string | null }) => {
      const { data, error } = await supabase
        .from('project_task_comments' as never)
        .insert({
          task_id: input.task_id,
          project_id: input.project_id,
          body: input.body,
          kind: input.kind ?? 'comment',
          author_type: 'person',
          author_id: input.author_id ?? null,
          author_name: input.author_name ?? null,
        } as never)
        .select('id')
        .single();
      if (error) throw error;
      if (!data) throw new Error('The comment was not written');
      return data;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['task-comments', v.task_id] });
    },
  });
}

/** What agents did on this task, out of the same ledger objectives close on. */
export interface TaskActivityRow {
  id: string;
  created_at: string;
  agent: string | null;
  skill_name: string | null;
  status: string | null;
  output: unknown;
  error_message: string | null;
}

export function useTaskActivity(taskId: string | null) {
  return useQuery({
    queryKey: ['task-activity', taskId],
    enabled: !!taskId,
    queryFn: async (): Promise<TaskActivityRow[]> => {
      // Skill calls name the task in their arguments (task_id) — that is the
      // join. No hidden steps: whatever an agent did here is on the card.
      const { data, error } = await supabase
        .from('agent_activity' as never)
        .select('id, created_at, agent, skill_name, status, output, error_message')
        .or(`input->>task_id.eq.${taskId},output->>task_id.eq.${taskId}`)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as TaskActivityRow[];
    },
  });
}

/** Every dependency in a project, so the list can mark blocked rows without a query per row. */
export function useProjectDependencyMap(projectId: string | null, taskIds: string[]) {
  return useQuery({
    queryKey: ['project-dependency-map', projectId, taskIds.length],
    enabled: !!projectId && taskIds.length > 0,
    queryFn: async (): Promise<Record<string, string[]>> => {
      const { data, error } = await supabase
        .from('project_task_dependencies' as never)
        .select('task_id, depends_on_task_id')
        .in('task_id', taskIds)
        .limit(2000);
      if (error) throw error;
      const map: Record<string, string[]> = {};
      for (const r of (data ?? []) as Array<{ task_id: string; depends_on_task_id: string }>) {
        (map[r.task_id] ??= []).push(r.depends_on_task_id);
      }
      return map;
    },
  });
}
