import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';

/* ---------- Technicians (from employees) ---------- */
export interface TechnicianOption { id: string; name: string; title: string | null; }

export function useTechnicians() {
  return useQuery({
    queryKey: ['fs-technicians'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('employees').select('id, name, title, status').order('name');
      if (error) throw error;
      return ((data ?? []) as any[])
        .filter((e) => e.status !== 'terminated')
        .map((e) => ({ id: e.id, name: e.name, title: e.title } as TechnicianOption));
    },
  });
}

/* ---------- Availability ---------- */
export interface AvailabilityConflict {
  visit_id?: string;
  service_order_id?: string;
  order_number?: string;
  scheduled_start?: string;
  scheduled_end?: string;
  [k: string]: any;
}
export interface AvailabilityResult {
  available: boolean;
  conflicts: AvailabilityConflict[];
}

function normalizeAvailability(data: any): AvailabilityResult {
  if (!data) return { available: true, conflicts: [] };
  const conflicts = data.conflicts ?? (Array.isArray(data) ? data : []);
  return {
    available: data.available ?? conflicts.length === 0,
    conflicts: conflicts ?? [],
  };
}

export async function checkTechnicianAvailability(params: {
  technician_id: string; start: string; end: string; exclude_visit_id?: string;
}): Promise<AvailabilityResult> {
  const { data, error } = await supabase.rpc('check_technician_availability' as any, {
    p_technician_id: params.technician_id,
    p_start: params.start,
    p_end: params.end,
    p_exclude_visit_id: params.exclude_visit_id ?? null,
  });
  if (error) throw error;
  return normalizeAvailability(data);
}

/* ---------- Visit clock in/out + proof ---------- */
export function useRecordVisitTime() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { visit_id: string; action: 'start' | 'stop' }) => {
      const { data, error } = await supabase.rpc('record_visit_time' as any, {
        p_visit_id: p.visit_id, p_action: p.action,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['service-visits'] });
      toast.success(v.action === 'start' ? 'Clocked in' : 'Clocked out');
    },
    onError: (e: Error) => { logger.error('visit time', e); toast.error(e.message); },
  });
}

export function useRecordVisitProof() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: {
      visit_id: string; signature_url?: string; photo_urls?: string[];
      signed_by?: string; notes?: string;
    }) => {
      const { data, error } = await supabase.rpc('record_visit_proof' as any, {
        p_visit_id: p.visit_id,
        p_signature_url: p.signature_url ?? null,
        p_photo_urls: (p.photo_urls ?? null) as any,
        p_signed_by: p.signed_by ?? null,
        p_notes: p.notes ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['service-visits'] });
      toast.success('Proof recorded');
    },
    onError: (e: Error) => { logger.error('visit proof', e); toast.error(e.message); },
  });
}

/* ---------- SLA ---------- */
export interface SlaStatus {
  response_hours: number | null;
  resolution_hours: number | null;
  response_met: boolean | null;
  resolution_met: boolean | null;
  first_response_at: string | null;
  resolved_at: string | null;
  breached: boolean;
  [k: string]: any;
}

export function useSlaStatus(orderId: string | undefined) {
  return useQuery({
    queryKey: ['fs-sla-status', orderId],
    enabled: !!orderId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('manage_service_sla' as any, {
        p_action: 'status', p_order_id: orderId!,
      });
      if (error) throw error;
      return (data ?? {}) as SlaStatus;
    },
  });
}

export function useSetSla() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { order_id: string; response_hours: number; resolution_hours: number }) => {
      const { data, error } = await supabase.rpc('manage_service_sla' as any, {
        p_action: 'set', p_order_id: p.order_id,
        p_response_hours: p.response_hours, p_resolution_hours: p.resolution_hours,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['fs-sla-status', v.order_id] });
      qc.invalidateQueries({ queryKey: ['fs-sla-breaches'] });
      toast.success('SLA targets set');
    },
    onError: (e: Error) => { logger.error('sla set', e); toast.error(e.message); },
  });
}

export function useSlaBreaches() {
  return useQuery({
    queryKey: ['fs-sla-breaches'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('manage_service_sla' as any, { p_action: 'list_breaches' });
      if (error) throw error;
      const rows: any[] = Array.isArray(data) ? data : (data?.breaches ?? []);
      return new Set<string>(rows.map((r) => r.order_id ?? r.id).filter(Boolean));
    },
    refetchInterval: 60_000,
  });
}

/* ---------- Packages ---------- */
export interface ServicePackage {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  lines: PackageLine[];
  [k: string]: any;
}
export interface PackageLine {
  kind: 'labor' | 'material' | 'expense' | 'other';
  description: string;
  quantity: number;
  unit_price: number;
  product_id?: string | null;
}

export function useServicePackages() {
  return useQuery({
    queryKey: ['fs-packages'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('manage_service_package' as any, { p_action: 'list' });
      if (error) throw error;
      const rows: any[] = Array.isArray(data) ? data : (data?.packages ?? []);
      return rows as ServicePackage[];
    },
  });
}

export function useServicePackageMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: {
      action: 'create' | 'update' | 'delete' | 'apply';
      package_id?: string; order_id?: string;
      name?: string; description?: string; active?: boolean;
      lines?: PackageLine[];
    }) => {
      const { data, error } = await supabase.rpc('manage_service_package' as any, {
        p_action: p.action,
        p_package_id: p.package_id ?? null,
        p_order_id: p.order_id ?? null,
        p_name: p.name ?? null,
        p_description: p.description ?? null,
        p_lines: (p.lines ?? null) as any,
        p_active: p.active ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['fs-packages'] });
      if (v.action === 'apply') {
        qc.invalidateQueries({ queryKey: ['service-order-lines', v.order_id] });
        qc.invalidateQueries({ queryKey: ['service-order', v.order_id] });
        toast.success('Package applied');
      } else if (v.action === 'delete') {
        toast.success('Package deleted');
      } else {
        toast.success('Package saved');
      }
    },
    onError: (e: Error) => { logger.error('pkg', e); toast.error(e.message); },
  });
}

/* ---------- Recurrence ---------- */
export function useRecurrenceMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: {
      action: 'set' | 'clear'; order_id: string;
      rule?: 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly';
      until?: string | null;
    }) => {
      const { data, error } = await supabase.rpc('manage_recurring_service_order' as any, {
        p_action: p.action, p_order_id: p.order_id,
        p_rule: p.rule ?? null, p_until: p.until ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['service-order', v.order_id] });
      qc.invalidateQueries({ queryKey: ['service-orders'] });
      toast.success(v.action === 'set' ? 'Recurrence set' : 'Recurrence cleared');
    },
    onError: (e: Error) => { logger.error('recur', e); toast.error(e.message); },
  });
}

/* ---------- Link to contract/project/deal ---------- */
export function useLinkServiceOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: {
      order_id: string;
      contract_id?: string | null;
      project_id?: string | null;
      deal_id?: string | null;
      unlink?: 'contract' | 'project' | 'deal';
    }) => {
      const { data, error } = await supabase.rpc('link_service_order' as any, {
        p_order_id: p.order_id,
        p_contract_id: p.contract_id ?? null,
        p_project_id: p.project_id ?? null,
        p_deal_id: p.deal_id ?? null,
        p_unlink: p.unlink ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['service-order', v.order_id] });
      qc.invalidateQueries({ queryKey: ['service-orders'] });
      toast.success('Link updated');
    },
    onError: (e: Error) => { logger.error('link', e); toast.error(e.message); },
  });
}
