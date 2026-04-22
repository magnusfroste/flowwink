import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface PerformanceGoal {
  id: string;
  employee_id: string;
  title: string;
  description: string | null;
  category: string;
  target_date: string | null;
  progress_pct: number;
  status: string;
  weight: number;
  created_at: string;
  updated_at: string;
}

export interface OneOnOne {
  id: string;
  employee_id: string;
  manager_id: string;
  scheduled_at: string;
  duration_minutes: number;
  agenda: string | null;
  notes: string | null;
  action_items: Array<{ text: string; done: boolean; assignee?: string }>;
  employee_mood: string | null;
  status: string;
  completed_at: string | null;
}

export interface Feedback {
  id: string;
  receiver_id: string;
  giver_id: string | null;
  giver_user_id: string | null;
  feedback_type: string;
  rating: number | null;
  strengths: string | null;
  improvements: string | null;
  comments: string | null;
  is_anonymous: boolean;
  visibility: string;
  created_at: string;
}

export interface PerformanceReview {
  id: string;
  employee_id: string;
  reviewer_id: string | null;
  period_type: string;
  period_start: string;
  period_end: string;
  overall_rating: number | null;
  achievements: string | null;
  areas_of_improvement: string | null;
  goals_next_period: string | null;
  manager_comments: string | null;
  employee_comments: string | null;
  salary_adjustment_pct: number | null;
  promotion_recommended: boolean;
  status: string;
  acknowledged_at: string | null;
  created_at: string;
}

// ---------- Goals ----------
export function useGoals(employeeId?: string) {
  return useQuery({
    queryKey: ["performance_goals", employeeId],
    queryFn: async () => {
      let q = supabase.from("performance_goals" as any).select("*").order("created_at", { ascending: false });
      if (employeeId) q = q.eq("employee_id", employeeId);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as unknown as PerformanceGoal[];
    },
  });
}

export function useUpsertGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (goal: Partial<PerformanceGoal> & { employee_id: string; title: string }) => {
      const { data, error } = goal.id
        ? await supabase.from("performance_goals" as any).update(goal).eq("id", goal.id).select().single()
        : await supabase.from("performance_goals" as any).insert(goal as any).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["performance_goals"] });
      toast.success("Goal saved");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useDeleteGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("performance_goals" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["performance_goals"] });
      toast.success("Goal deleted");
    },
  });
}

// ---------- 1:1s ----------
export function useOneOnOnes(employeeId?: string) {
  return useQuery({
    queryKey: ["one_on_ones", employeeId],
    queryFn: async () => {
      let q = supabase.from("one_on_ones" as any).select("*").order("scheduled_at", { ascending: false });
      if (employeeId) q = q.or(`employee_id.eq.${employeeId},manager_id.eq.${employeeId}`);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as unknown as OneOnOne[];
    },
  });
}

export function useUpsertOneOnOne() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (m: Partial<OneOnOne> & { employee_id: string; manager_id: string; scheduled_at: string }) => {
      const payload: any = { ...m };
      const { data, error } = m.id
        ? await supabase.from("one_on_ones" as any).update(payload).eq("id", m.id).select().single()
        : await supabase.from("one_on_ones" as any).insert(payload).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["one_on_ones"] });
      toast.success("1:1 saved");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

// ---------- Feedback ----------
export function useFeedback(receiverId?: string) {
  return useQuery({
    queryKey: ["feedback", receiverId],
    queryFn: async () => {
      let q = supabase.from("feedback" as any).select("*").order("created_at", { ascending: false });
      if (receiverId) q = q.eq("receiver_id", receiverId);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as unknown as Feedback[];
    },
  });
}

export function useGiveFeedback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (fb: Partial<Feedback> & { receiver_id: string }) => {
      const user = await supabase.auth.getUser();
      const payload: any = { ...fb, giver_user_id: user.data.user?.id };
      const { data, error } = await supabase.from("feedback" as any).insert(payload).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["feedback"] });
      toast.success("Feedback sent");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

// ---------- Reviews ----------
export function useReviews(employeeId?: string) {
  return useQuery({
    queryKey: ["performance_reviews", employeeId],
    queryFn: async () => {
      let q = supabase.from("performance_reviews" as any).select("*").order("period_end", { ascending: false });
      if (employeeId) q = q.eq("employee_id", employeeId);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as unknown as PerformanceReview[];
    },
  });
}

export function useUpsertReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (r: Partial<PerformanceReview> & { employee_id: string; period_start: string; period_end: string }) => {
      const { data, error } = r.id
        ? await supabase.from("performance_reviews" as any).update(r as any).eq("id", r.id).select().single()
        : await supabase.from("performance_reviews" as any).insert(r as any).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["performance_reviews"] });
      toast.success("Review saved");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useAcknowledgeReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, comments }: { id: string; comments?: string }) => {
      const { error } = await supabase
        .from("performance_reviews" as any)
        .update({ status: "acknowledged", acknowledged_at: new Date().toISOString(), employee_comments: comments } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["performance_reviews"] });
      toast.success("Review acknowledged");
    },
  });
}
