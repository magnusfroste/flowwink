import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type AttendanceEntry = {
  id: string;
  employee_id: string;
  clock_in: string;
  clock_out: string | null;
  break_minutes: number;
  total_minutes: number | null;
  notes: string | null;
  source: string;
  created_at: string;
  employees?: { name: string } | null;
};

export function useMyAttendance(limit = 30) {
  return useQuery({
    queryKey: ["attendance", "me", limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance_entries")
        .select("*")
        .order("clock_in", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data as AttendanceEntry[];
    },
  });
}

export function useOpenAttendance() {
  return useQuery({
    queryKey: ["attendance", "open"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance_entries")
        .select("*")
        .is("clock_out", null)
        .order("clock_in", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as AttendanceEntry | null;
    },
  });
}

export function useAllAttendance(from?: string, to?: string) {
  return useQuery({
    queryKey: ["attendance", "all", from, to],
    queryFn: async () => {
      let q = supabase
        .from("attendance_entries")
        .select("*, employees(name)")
        .order("clock_in", { ascending: false })
        .limit(500);
      if (from) q = q.gte("clock_in", from);
      if (to) q = q.lte("clock_in", to);
      const { data, error } = await q;
      if (error) throw error;
      return data as AttendanceEntry[];
    },
  });
}

export function useClockIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("clock_in", {});
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attendance"] });
      toast.success("Clocked in");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useClockOut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { break_minutes?: number; notes?: string }) => {
      const { error } = await supabase.rpc("clock_out", {
        p_break_minutes: input.break_minutes ?? 0,
        p_notes: input.notes ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attendance"] });
      toast.success("Clocked out");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function formatMinutes(min: number | null): string {
  if (min == null) return "–";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h ${m}m`;
}
