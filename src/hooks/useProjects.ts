import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type Project = {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean | null;
  is_billable: boolean | null;
  client_name: string | null;
  budget_hours: number | null;
  hourly_rate_cents: number | null;
  currency: string | null;
  color: string | null;
  deadline: string | null;
  visibility: 'shared' | 'private';
  /** Who is accountable now. Defaults to the creator, changeable; the lens reads this. */
  owner_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ProjectTask = {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  assigned_to: string | null;
  start_date: string | null;
  due_date: string | null;
  estimated_hours: number | null;
  sort_order: number;
  completed_at: string | null;
  parent_task_id: string | null;
  created_at: string;
  /** The pieces of done — see src/lib/task-card.ts. */
  checklist?: Array<{ id: string; text: string; done: boolean; done_at?: string | null; done_by?: string | null }> | null;
};

export function useProjects() {
  return useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as Project[];
    },
  });
}

export function useProjectTasks(projectId?: string) {
  return useQuery({
    queryKey: ["project_tasks", projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_tasks")
        .select("*")
        .eq("project_id", projectId!)
        .order("sort_order");
      if (error) throw error;
      return data as ProjectTask[];
    },
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<Project>) => {
      const { data, error } = await supabase.from("projects").insert(input as any).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Project created");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useCreateProjectTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<ProjectTask>) => {
      const { data, error } = await supabase.from("project_tasks").insert(input as any).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ["project_tasks", variables.project_id] });
      qc.invalidateQueries({ queryKey: ["project_task_stats"] });
      toast.success("Task added");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateProjectTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, project_id, ...updates }: Partial<ProjectTask> & { id: string; project_id: string }) => {
      const { error } = await supabase.from("project_tasks").update(updates as any).eq("id", id);
      if (error) throw error;
      return project_id;
    },
    onSuccess: (projectId) => {
      qc.invalidateQueries({ queryKey: ["project_tasks", projectId] });
      qc.invalidateQueries({ queryKey: ["project_task_stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Project> & { id: string }) => {
      const { error } = await supabase.from("projects").update(updates as any).eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Project updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // Delete child tasks first to avoid FK issues
      const { error: tasksErr } = await supabase.from("project_tasks").delete().eq("project_id", id);
      if (tasksErr) throw tasksErr;
      const { error } = await supabase.from("projects").delete().eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Project deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteProjectTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, project_id }: { id: string; project_id: string }) => {
      const { error } = await supabase.from("project_tasks").delete().eq("id", id);
      if (error) throw error;
      return project_id;
    },
    onSuccess: (projectId) => {
      qc.invalidateQueries({ queryKey: ["project_tasks", projectId] });
      qc.invalidateQueries({ queryKey: ["project_task_stats"] });
      toast.success("Task deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export type ProjectTaskStats = {
  total: number;
  done: number;
  open: number;
  inProgress: number;
  overdue: number;
  dueSoon: number;
  progress: number; // 0-100
};

/**
 * One query for the whole portfolio: per-project task rollups used by the
 * project rail and the KPI strip. Avoids N per-project queries.
 */
export function useProjectTaskStats() {
  return useQuery({
    queryKey: ["project_task_stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_tasks")
        .select("project_id,status,due_date");
      if (error) throw error;

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const soon = new Date(today);
      soon.setDate(soon.getDate() + 7);

      const map = new Map<string, ProjectTaskStats>();
      for (const row of (data ?? []) as { project_id: string; status: string; due_date: string | null }[]) {
        const s =
          map.get(row.project_id) ??
          { total: 0, done: 0, open: 0, inProgress: 0, overdue: 0, dueSoon: 0, progress: 0 };
        s.total += 1;
        if (row.status === "done") s.done += 1;
        else {
          s.open += 1;
          if (row.status === "in_progress") s.inProgress += 1;
          if (row.due_date) {
            const due = new Date(row.due_date);
            if (due < today) s.overdue += 1;
            else if (due <= soon) s.dueSoon += 1;
          }
        }
        map.set(row.project_id, s);
      }
      for (const s of map.values()) {
        s.progress = s.total ? Math.round((s.done / s.total) * 100) : 0;
      }
      return map;
    },
  });
}
