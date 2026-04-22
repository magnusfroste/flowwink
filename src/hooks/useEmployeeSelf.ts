import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * Returns the employees row linked to the currently logged-in user (if any).
 * Used to gate employee-only sections of the customer portal.
 */
export function useEmployeeSelf() {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ["employee_self", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id, name, email, title, department, status, start_date")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  return {
    employee: query.data ?? null,
    isEmployee: !!query.data,
    loading: query.isLoading,
  };
}
