import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { logger } from "@/lib/logger";

export interface GanttTask {
  id: string;
  title: string;
  status: string;
  priority: string;
  start_date: string | null;
  due_date: string | null;
  estimated_hours: number | null;
  depth: number;
  depends_on: string[];
}
export interface GanttMilestone {
  id: string;
  name: string;
  due_date: string | null;
  is_reached: boolean;
}
export interface ProjectSchedule {
  tasks: GanttTask[];
  dependencies: Array<{ task_id: string; depends_on_task_id: string }>;
  milestones: GanttMilestone[];
}

export function useProjectSchedule(projectId: string | null) {
  return useQuery({
    queryKey: ["project-schedule", projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_project_schedule" as any, {
        p_project_id: projectId,
      });
      if (error) throw error;
      const d: any = data ?? {};
      return {
        tasks: (d.tasks ?? []) as GanttTask[],
        dependencies: (d.dependencies ?? []) as ProjectSchedule["dependencies"],
        milestones: (d.milestones ?? []) as GanttMilestone[],
      };
    },
  });
}

export interface CapacityResource {
  user_id: string;
  name: string;
  open_tasks: number;
  open_estimated_hours: number;
  hours_logged_in_window: number;
  utilization_pct: number;
  weeks_of_backlog: number;
  overloaded: boolean;
}

export function useCapacityReport(projectId: string | null, weeks = 4) {
  return useQuery({
    queryKey: ["resource-capacity", projectId, weeks],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("resource_capacity_report" as any, {
        p_project_id: projectId,
        p_weeks: weeks,
      });
      if (error) throw error;
      const d: any = data ?? {};
      return (d.resources ?? []) as CapacityResource[];
    },
  });
}

export function useTaskDependencies(taskId: string | null, projectId: string | null) {
  return useQuery({
    queryKey: ["task-dependencies", taskId],
    enabled: !!taskId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("manage_task_dependency" as any, {
        p_action: "list",
        p_task_id: taskId,
        p_depends_on_task_id: null,
        p_project_id: projectId,
      });
      if (error) throw error;
      const d: any = data;
      const rows: any[] = Array.isArray(d) ? d : (d?.dependencies ?? d?.depends_on ?? []);
      return rows.map((r) => (typeof r === "string" ? r : r.depends_on_task_id ?? r.id)) as string[];
    },
  });
}

export function useManageDependency() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: {
      action: "add" | "remove";
      task_id: string;
      depends_on_task_id: string;
      project_id: string;
    }) => {
      const { data, error } = await supabase.rpc("manage_task_dependency" as any, {
        p_action: p.action,
        p_task_id: p.task_id,
        p_depends_on_task_id: p.depends_on_task_id,
        p_project_id: p.project_id,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["task-dependencies", v.task_id] });
      qc.invalidateQueries({ queryKey: ["project-schedule", v.project_id] });
    },
    onError: (e: Error) => {
      logger.error("dependency", e);
      toast.error(e.message);
    },
  });
}
