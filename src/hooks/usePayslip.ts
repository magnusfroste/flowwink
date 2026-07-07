import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { PayslipData } from '@/components/payroll/PayslipView';

export type PayslipListItem = {
  run_id: string;
  period: string;
  status: string;
  gross_cents: number;
  net_cents: number;
};

export type PayslipList = {
  employee_id: string;
  employee_name: string | null;
  payslips: PayslipListItem[];
};

/** Full payslip for a given run + employee. Admins must pass employeeId. */
export function usePayslip(runId: string | null, employeeId?: string | null, enabled = true) {
  return useQuery({
    queryKey: ['payslip', runId, employeeId ?? null],
    enabled: enabled && !!runId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_payslip' as any, {
        p_run_id: runId,
        p_employee_id: employeeId ?? null,
      });
      if (error) throw error;
      return data as unknown as PayslipData;
    },
  });
}

/** Self-service: list all payslips for the currently authenticated employee. */
export function useMyPayslips(enabled = true) {
  return useQuery({
    queryKey: ['my_payslips'],
    enabled,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_payslip' as any, {
        p_run_id: null,
        p_employee_id: null,
      });
      if (error) throw error;
      return data as unknown as PayslipList;
    },
  });
}
