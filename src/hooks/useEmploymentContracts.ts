import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface OnboardingTemplate {
  id: string;
  name: string;
  description: string | null;
  department: string | null;
  employment_type: string | null;
  items: Array<{ id: string; title: string; done?: boolean; category?: string }>;
  is_active: boolean;
  is_default: boolean;
  created_at: string;
}

export interface ContractTemplate {
  id: string;
  name: string;
  description: string | null;
  employment_type: string;
  body_markdown: string;
  default_probation_months: number | null;
  default_notice_period_days: number | null;
  is_active: boolean;
  is_default: boolean;
}

export interface EmploymentContract {
  id: string;
  employee_id: string;
  template_id: string | null;
  title: string;
  employment_type: string;
  start_date: string;
  end_date: string | null;
  probation_end_date: string | null;
  notice_period_days: number | null;
  monthly_salary_cents: number | null;
  hourly_rate_cents: number | null;
  currency: string;
  weekly_hours: number | null;
  body_markdown: string;
  status: "draft" | "sent" | "signed" | "active" | "terminated" | "expired";
  sent_at: string | null;
  signed_at: string | null;
  signed_by_employee_at: string | null;
  signed_by_employer_at: string | null;
  terminated_at: string | null;
  termination_reason: string | null;
  created_at: string;
}

export function useOnboardingTemplates() {
  return useQuery({
    queryKey: ["onboarding-templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("onboarding_templates" as any)
        .select("*")
        .order("is_default", { ascending: false })
        .order("name");
      if (error) throw error;
      return (data as unknown as OnboardingTemplate[]) || [];
    },
  });
}

export function useContractTemplatesEmp() {
  return useQuery({
    queryKey: ["employment-contract-templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employment_contract_templates" as any)
        .select("*")
        .order("is_default", { ascending: false })
        .order("name");
      if (error) throw error;
      return (data as unknown as ContractTemplate[]) || [];
    },
  });
}

export function useEmploymentContracts(employeeId?: string) {
  return useQuery({
    queryKey: ["employment-contracts", employeeId ?? "all"],
    queryFn: async () => {
      let query = supabase
        .from("employment_contracts" as any)
        .select("*")
        .order("created_at", { ascending: false });
      if (employeeId) query = query.eq("employee_id", employeeId);
      const { data, error } = await query;
      if (error) throw error;
      return (data as unknown as EmploymentContract[]) || [];
    },
  });
}

export function useApplyOnboardingTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { employee_id: string; template_id: string }) => {
      const { data, error } = await supabase.rpc("apply_onboarding_template" as any, {
        p_employee_id: params.employee_id,
        p_template_id: params.template_id,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["onboarding-checklists"] });
      toast.success("Onboarding checklist created");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useCreateEmploymentContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      payload: Partial<EmploymentContract> & { employee_id: string; title: string; start_date: string }
    ) => {
      const { data, error } = await supabase
        .from("employment_contracts" as any)
        .insert(payload as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employment-contracts"] });
      toast.success("Contract created");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useUpdateEmploymentContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<EmploymentContract> & { id: string }) => {
      const { data, error } = await supabase
        .from("employment_contracts" as any)
        .update(patch as any)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employment-contracts"] }),
    onError: (e: any) => toast.error(e.message),
  });
}

export function useSignEmploymentContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, side }: { id: string; side: "employee" | "employer" }) => {
      const { data, error } = await supabase.rpc("sign_employment_contract" as any, {
        p_contract_id: id,
        p_side: side,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employment-contracts"] });
      toast.success("Contract signed");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function renderEmploymentTemplate(
  body: string,
  vars: Record<string, string | number | null | undefined>
): string {
  return body.replace(/\{\{(\w+)\}\}/g, (_m, key) => {
    const v = vars[key];
    return v === null || v === undefined || v === "" ? `{{${key}}}` : String(v);
  });
}
