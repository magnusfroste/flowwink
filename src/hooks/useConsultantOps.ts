import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';

/* ---------- Assignments ---------- */
export interface ConsultantAssignment {
  id: string;
  consultant_id: string;
  consultant_name?: string;
  client_name: string | null;
  company_id: string | null;
  contract_id: string | null;
  contract_title?: string | null;
  project_id: string | null;
  role_title: string | null;
  start_date: string | null;
  end_date: string | null;
  allocation_pct: number | null;
  hourly_rate_cents: number | null;
  currency: string | null;
  status: 'planned' | 'active' | 'ended' | string;
  sow_url: string | null;
  notes: string | null;
  [k: string]: any;
}

export function useAssignments() {
  return useQuery({
    queryKey: ['consultant-assignments'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('manage_consultant_assignment' as any, { p_action: 'list' });
      if (error) throw error;
      const rows: any[] = Array.isArray(data) ? data : (data?.assignments ?? []);
      return rows as ConsultantAssignment[];
    },
  });
}

export function useAssignmentMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: {
      action: 'create' | 'update' | 'end';
      assignment_id?: string;
      consultant_id?: string;
      client_name?: string;
      company_id?: string;
      contract_id?: string;
      project_id?: string;
      role_title?: string;
      start_date?: string;
      end_date?: string;
      allocation_pct?: number;
      hourly_rate_cents?: number;
      currency?: string;
      status?: string;
      sow_url?: string;
      notes?: string;
    }) => {
      const { data, error } = await supabase.rpc('manage_consultant_assignment' as any, {
        p_action: p.action,
        p_assignment_id: p.assignment_id ?? null,
        p_consultant_id: p.consultant_id ?? null,
        p_client_name: p.client_name ?? null,
        p_company_id: p.company_id ?? null,
        p_contract_id: p.contract_id ?? null,
        p_project_id: p.project_id ?? null,
        p_role_title: p.role_title ?? null,
        p_start_date: p.start_date ?? null,
        p_end_date: p.end_date ?? null,
        p_allocation_pct: p.allocation_pct ?? null,
        p_hourly_rate_cents: p.hourly_rate_cents ?? null,
        p_currency: p.currency ?? null,
        p_status: p.status ?? null,
        p_sow_url: p.sow_url ?? null,
        p_notes: p.notes ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['consultant-assignments'] });
      qc.invalidateQueries({ queryKey: ['consultant-utilization'] });
      if (v.action === 'end') toast.success('Assignment ended');
      else toast.success('Assignment saved');
    },
    onError: (e: Error) => { logger.error('assignment', e); toast.error(e.message); },
  });
}

/* ---------- Utilization ---------- */
export interface UtilizationRow {
  consultant_id: string;
  consultant_name: string;
  utilization_pct: number;
  assignments?: Array<{ client_name: string; allocation_pct: number; role_title?: string }>;
  [k: string]: any;
}

export function useUtilizationReport(from: string, to: string) {
  return useQuery({
    queryKey: ['consultant-utilization', from, to],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('consultant_utilization_report' as any, {
        p_from: from, p_to: to, p_consultant_id: null,
      });
      if (error) throw error;
      const rows: any[] = Array.isArray(data) ? data : (data?.report ?? data?.rows ?? []);
      return rows as UtilizationRow[];
    },
  });
}

/* ---------- Rates ---------- */
export interface RateMatrixRow {
  consultant_id: string;
  consultant_name: string;
  default_hourly_rate_cents: number | null;
  rates: Array<{ skill: string; level: string | null; hourly_rate_cents: number; currency: string | null }>;
  [k: string]: any;
}

export function useRateMatrix() {
  return useQuery({
    queryKey: ['consultant-rate-matrix'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('manage_consultant_rates' as any, { p_action: 'matrix' });
      if (error) throw error;
      const rows: any[] = Array.isArray(data) ? data : (data?.matrix ?? data?.rows ?? []);
      return rows as RateMatrixRow[];
    },
  });
}

export function useRateMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: {
      action: 'set' | 'delete';
      consultant_id: string;
      skill: string;
      level?: 'junior' | 'mid' | 'senior' | 'expert';
      hourly_rate_cents?: number;
      currency?: string;
    }) => {
      const { data, error } = await supabase.rpc('manage_consultant_rates' as any, {
        p_action: p.action,
        p_consultant_id: p.consultant_id,
        p_skill: p.skill,
        p_level: p.level ?? null,
        p_hourly_rate_cents: p.hourly_rate_cents ?? null,
        p_currency: p.currency ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['consultant-rate-matrix'] });
      toast.success('Rate saved');
    },
    onError: (e: Error) => { logger.error('rate', e); toast.error(e.message); },
  });
}
