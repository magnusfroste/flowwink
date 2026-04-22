import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useEmployeeSelf } from "@/hooks/useEmployeeSelf";

export type TeamMember = {
  id: string;
  name: string;
  email: string | null;
  title: string | null;
  department: string | null;
  status: string;
  manager_id: string | null;
};

export type TeamLeaveRequest = {
  id: string;
  employee_id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  days: number;
  status: string;
  reason: string | null;
  created_at: string;
  employees?: { name: string; title: string | null } | null;
};

/** All employees that report to the logged-in user (any depth). */
export function useMyTeam() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my_team", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data: ids, error: idErr } = await supabase.rpc("get_team_member_ids", {
        _manager_user_id: user!.id,
      });
      if (idErr) throw idErr;
      const idList = (ids ?? []).map((r: { employee_id: string }) => r.employee_id);
      if (!idList.length) return [] as TeamMember[];

      const { data, error } = await supabase
        .from("employees")
        .select("id,name,email,title,department,status,manager_id")
        .in("id", idList)
        .order("name");
      if (error) throw error;
      return (data ?? []) as TeamMember[];
    },
  });
}

/** Leave requests from the manager's team. */
export function useTeamLeaveRequests() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["team_leave_requests", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data: ids, error: idErr } = await supabase.rpc("get_team_member_ids", {
        _manager_user_id: user!.id,
      });
      if (idErr) throw idErr;
      const idList = (ids ?? []).map((r: { employee_id: string }) => r.employee_id);
      if (!idList.length) return [] as TeamLeaveRequest[];

      const { data, error } = await supabase
        .from("leave_requests")
        .select("*, employees(name,title)")
        .in("employee_id", idList)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as TeamLeaveRequest[];
    },
  });

  // Realtime: refresh when any team request changes
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`team-leave-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "leave_requests" },
        () => qc.invalidateQueries({ queryKey: ["team_leave_requests", user.id] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, qc]);

  return query;
}

/** True if the logged-in user manages at least one employee. */
export function useIsManager() {
  const { employee } = useEmployeeSelf();
  const { data } = useMyTeam();
  return {
    isManager: (data?.length ?? 0) > 0,
    teamSize: data?.length ?? 0,
    employeeId: employee?.id ?? null,
  };
}
