import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type Employee = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  department: string | null;
  employment_type: string;
  start_date: string | null;
  end_date: string | null;
  status: string;
  avatar_url: string | null;
  emergency_contact: Record<string, unknown> | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type LeaveRequest = {
  id: string;
  employee_id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  days: number;
  status: string;
  reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  notes: string | null;
  created_at: string;
  employees?: { name: string } | null;
};

export function useEmployees() {
  return useQuery({
    queryKey: ["employees"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("*")
        .order("name");
      if (error) throw error;
      return data as Employee[];
    },
  });
}

export function useLeaveRequests() {
  return useQuery({
    queryKey: ["leave_requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leave_requests")
        .select("*, employees(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as LeaveRequest[];
    },
  });
}

export function useCreateEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<Employee>) => {
      const { data, error } = await supabase
        .from("employees")
        .insert(input as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employees"] });
      toast.success("Employee added");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Employee> & { id: string }) => {
      const { error } = await supabase.from("employees").update(updates as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employees"] });
      toast.success("Employee updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useCreateLeaveRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<LeaveRequest>) => {
      const { data, error } = await supabase
        .from("leave_requests")
        .insert(input as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leave_requests"] });
      toast.success("Leave request created");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateLeaveRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; status?: string; reviewed_by?: string; reviewed_at?: string }) => {
      const { error } = await supabase.from("leave_requests").update(updates as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leave_requests"] });
      toast.success("Leave request updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
