import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type LeaveBalance = {
  leave_type: string;
  year: number;
  allocated_days: number;
  carried_over_days: number;
  used_days: number;
  pending_days: number;
  remaining_days: number;
};

export type LeaveAllocation = {
  id: string;
  employee_id: string;
  leave_type: string;
  year: number;
  allocated_days: number;
  carried_over_days: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

/** Balances for a single employee (all leave types) for a given year. */
export function useEmployeeLeaveBalances(employeeId: string | null | undefined, year?: number) {
  const y = year ?? new Date().getFullYear();
  return useQuery({
    queryKey: ["leave_balances", employeeId, y],
    enabled: !!employeeId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_employee_leave_balances", {
        p_employee_id: employeeId!,
        p_year: y,
      });
      if (error) throw error;
      return (data ?? []) as LeaveBalance[];
    },
  });
}

/** Raw allocations (admin view). */
export function useLeaveAllocations(employeeId?: string | null, year?: number) {
  return useQuery({
    queryKey: ["leave_allocations", employeeId ?? "all", year ?? "all"],
    queryFn: async () => {
      let q = supabase
        .from("leave_allocations" as any)
        .select("*")
        .order("year", { ascending: false })
        .order("leave_type");
      if (employeeId) q = q.eq("employee_id", employeeId);
      if (year) q = q.eq("year", year);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as LeaveAllocation[];
    },
  });
}

export function useUpsertLeaveAllocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id?: string;
      employee_id: string;
      leave_type: string;
      year: number;
      allocated_days: number;
      carried_over_days?: number;
      notes?: string | null;
    }) => {
      const payload = {
        employee_id: input.employee_id,
        leave_type: input.leave_type,
        year: input.year,
        allocated_days: input.allocated_days,
        carried_over_days: input.carried_over_days ?? 0,
        notes: input.notes ?? null,
      };
      const { error } = await supabase
        .from("leave_allocations" as any)
        .upsert(payload, { onConflict: "employee_id,leave_type,year" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leave_allocations"] });
      qc.invalidateQueries({ queryKey: ["leave_balances"] });
      toast.success("Allocation saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteLeaveAllocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("leave_allocations" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leave_allocations"] });
      qc.invalidateQueries({ queryKey: ["leave_balances"] });
      toast.success("Allocation deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
