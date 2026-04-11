import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type Project = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  client_name: string | null;
  budget_hours: number | null;
  hourly_rate_cents: number | null;
  currency: string;
  start_date: string | null;
  end_date: string | null;
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
  due_date: string | null;
  estimated_hours: number | null;
  sort_order: number;
  completed_at: string | null;
  created_at: string;
};

export function useProjects() {
  return useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as Project[];
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
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
