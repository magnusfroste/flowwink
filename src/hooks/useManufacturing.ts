import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

/**
 * Subscribe to live manufacturing_orders changes and invalidate the React Query cache
 * so the admin UI reflects status transitions in real time without polling.
 */
export function useManufacturingOrdersRealtime() {
  const qc = useQueryClient();
  useEffect(() => {
    const channel = supabase
      .channel('manufacturing_orders_admin')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'manufacturing_orders' },
        () => {
          qc.invalidateQueries({ queryKey: ['manufacturing_orders'] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);
}

export type MoStatus = 'draft' | 'planned' | 'confirmed' | 'in_progress' | 'done' | 'cancelled';

export function useManufacturingOrders(status?: MoStatus) {
  return useQuery({
    queryKey: ['manufacturing_orders', status ?? 'all'],
    queryFn: async () => {
      let q = supabase
        .from('manufacturing_orders' as never)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
      if (status) q = (q as never as { eq: (c: string, v: string) => typeof q }).eq('status', status);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Array<Record<string, unknown>>;
    },
  });
}

export interface BomHeader {
  id: string;
  product_id: string;
  version: string;
  quantity_produced: number;
  routing_notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface BomLine {
  id: string;
  bom_id: string;
  component_product_id: string;
  quantity: number;
  unit: string | null;
  scrap_pct: number | null;
  position: number | null;
}

export function useBoms() {
  return useQuery({
    queryKey: ['bom_headers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bom_headers' as never)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as BomHeader[];
    },
  });
}

export function useBomLines(bomId: string | undefined) {
  return useQuery({
    queryKey: ['bom_lines', bomId],
    enabled: !!bomId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bom_lines' as never)
        .select('*')
        .eq('bom_id', bomId as string)
        .order('position', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as BomLine[];
    },
  });
}

export interface CreateBomLineInput {
  component_product_id: string;
  quantity: number;
  unit?: string;
  scrap_pct?: number;
  position?: number;
}

export function useCreateBom() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (args: {
      p_product_id: string;
      p_lines: CreateBomLineInput[];
      p_version?: string;
      p_quantity_produced?: number;
      p_routing_notes?: string;
      p_activate?: boolean;
    }) => {
      const { data, error } = await supabase.rpc('create_bom' as never, args as never);
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast({ title: 'BOM created ✓' });
      qc.invalidateQueries({ queryKey: ['bom_headers'] });
    },
    onError: (e: Error) =>
      toast({ title: 'Create BOM failed', description: e.message, variant: 'destructive' }),
  });
}

export function useActivateBom() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ bomId, productId }: { bomId: string; productId: string }) => {
      const { error: deactivateErr } = await supabase
        .from('bom_headers' as never)
        .update({ is_active: false } as never)
        .eq('product_id', productId);
      if (deactivateErr) throw deactivateErr;
      const { error } = await supabase
        .from('bom_headers' as never)
        .update({ is_active: true } as never)
        .eq('id', bomId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: 'BOM activated ✓' });
      qc.invalidateQueries({ queryKey: ['bom_headers'] });
    },
    onError: (e: Error) =>
      toast({ title: 'Activate BOM failed', description: e.message, variant: 'destructive' }),
  });
}

export function useUpdateBomHeader() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: { id: string } & Partial<Pick<BomHeader, 'version' | 'quantity_produced' | 'routing_notes'>>) => {
      const { error } = await supabase
        .from('bom_headers' as never)
        .update(updates as never)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: 'BOM updated ✓' });
      qc.invalidateQueries({ queryKey: ['bom_headers'] });
    },
    onError: (e: Error) =>
      toast({ title: 'Update BOM failed', description: e.message, variant: 'destructive' }),
  });
}

export function useReplaceBomLines() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ bomId, lines }: { bomId: string; lines: CreateBomLineInput[] }) => {
      const { error: delErr } = await supabase.from('bom_lines' as never).delete().eq('bom_id', bomId);
      if (delErr) throw delErr;
      if (lines.length === 0) return;
      const rows = lines.map((l, idx) => ({
        bom_id: bomId,
        component_product_id: l.component_product_id,
        quantity: l.quantity,
        unit: l.unit ?? null,
        scrap_pct: l.scrap_pct ?? null,
        position: l.position ?? idx,
      }));
      const { error } = await supabase.from('bom_lines' as never).insert(rows as never);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      toast({ title: 'Components saved ✓' });
      qc.invalidateQueries({ queryKey: ['bom_lines', vars.bomId] });
    },
    onError: (e: Error) =>
      toast({ title: 'Save components failed', description: e.message, variant: 'destructive' }),
  });
}

function useMoMutation<TArgs extends Record<string, unknown>>(rpc: string, label: string) {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (args: TArgs) => {
      const { data, error } = await supabase.rpc(rpc as never, args as never);
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast({ title: `${label} ✓` });
      qc.invalidateQueries({ queryKey: ['manufacturing_orders'] });
    },
    onError: (e: Error) => toast({ title: `${label} failed`, description: e.message, variant: 'destructive' }),
  });
}

export const useConfirmMo = () => useMoMutation<{ p_mo_id: string }>('confirm_mo', 'Confirmed');
export const useStartMo = () => useMoMutation<{ p_mo_id: string }>('start_mo', 'Started');
export const useCompleteMo = () =>
  useMoMutation<{ p_mo_id: string; p_actual_qty?: number }>('complete_mo', 'Completed');
export const useCancelMo = () =>
  useMoMutation<{ p_mo_id: string; p_reason?: string }>('cancel_mo', 'Cancelled');
export const useCheckAvailability = () =>
  useMoMutation<{ p_mo_id: string }>('check_mo_availability', 'Availability checked');
export const useTriggerProcurement = () =>
  useMoMutation<{ p_mo_id: string }>('trigger_procurement_for_mo', 'Procurement requested');

export interface MrpCandidate {
  product_id: string;
  product_name: string;
  quantity_on_hand: number;
  reorder_point: number;
  suggested_qty: number;
  bom_id: string;
}

export interface MrpRunResult {
  success: boolean;
  dry_run: boolean;
  candidate_count: number;
  created: number;
  candidates: MrpCandidate[];
}

export function useMrpRun() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (p_dry_run: boolean): Promise<MrpRunResult> => {
      const { data, error } = await supabase.rpc('mrp_reorder_run' as never, { p_dry_run } as never);
      if (error) throw error;
      return data as unknown as MrpRunResult;
    },
    onSuccess: (data) => {
      if (!data.dry_run) {
        toast({ title: `Created ${data.created} draft MO(s) ✓` });
        qc.invalidateQueries({ queryKey: ['manufacturing_orders'] });
      }
    },
    onError: (e: Error) =>
      toast({ title: 'MRP run failed', description: e.message, variant: 'destructive' }),
  });
}

// ---------------------------------------------------------------------------
// Shop floor: work centers, routing operations, MO work orders
// ---------------------------------------------------------------------------

export interface WorkCenter {
  id: string;
  code: string;
  name: string;
  cost_per_hour_cents: number;
  capacity_per_hour: number;
  is_active: boolean;
  created_at: string;
}

export function useWorkCenters() {
  return useQuery({
    queryKey: ['work_centers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('work_centers' as never)
        .select('*')
        .order('code', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as WorkCenter[];
    },
  });
}

export function useManageWorkCenter() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (args: {
      p_action: 'create' | 'update' | 'delete';
      p_id?: string;
      p_code?: string;
      p_name?: string;
      p_cost_per_hour_cents?: number;
      p_capacity_per_hour?: number;
    }) => {
      const { data, error } = await supabase.rpc('manage_work_center' as never, args as never);
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, vars) => {
      toast({ title: `Work center ${vars.p_action}d ✓` });
      qc.invalidateQueries({ queryKey: ['work_centers'] });
    },
    onError: (e: Error) =>
      toast({ title: 'Work center action failed', description: e.message, variant: 'destructive' }),
  });
}

export interface RoutingOperation {
  id: string;
  sequence: number;
  name: string;
  work_center_id: string;
  duration_minutes: number;
  /** A work order on this operation cannot be finished until a quality check passes. */
  requires_inspection?: boolean;
  inspection_name?: string | null;
}

export function useRoutingOperations(bomId: string | undefined) {
  return useQuery({
    queryKey: ['routing_operations', bomId],
    enabled: !!bomId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('manage_routing_operation' as never, {
        p_action: 'list',
        p_bom_id: bomId,
      } as never);
      if (error) throw error;
      const payload = data as { operations?: RoutingOperation[] } | null;
      return (payload?.operations ?? []).slice().sort((a, b) => a.sequence - b.sequence);
    },
  });
}

export function useManageRoutingOperation() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (args: {
      p_action: 'create' | 'update' | 'delete';
      p_id?: string;
      p_bom_id?: string;
      p_sequence?: number;
      p_name?: string;
      p_work_center_id?: string;
      p_duration_minutes?: number;
      p_requires_inspection?: boolean;
      p_inspection_name?: string | null;
    }) => {
      const { data, error } = await supabase.rpc('manage_routing_operation' as never, args as never);
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['routing_operations'] });
      if (vars.p_action !== 'update') toast({ title: `Operation ${vars.p_action}d ✓` });
    },
    onError: (e: Error) =>
      toast({ title: 'Operation failed', description: e.message, variant: 'destructive' }),
  });
}

export interface MoWorkOrder {
  id: string;
  mo_id: string;
  routing_operation_id: string | null;
  sequence: number;
  name: string;
  work_center_id: string | null;
  status: string;
  planned_minutes: number;
  actual_minutes: number | null;
  planned_labor_cost_cents: number;
  actual_labor_cost_cents: number | null;
  started_at: string | null;
  completed_at: string | null;
  /** Units of the product lost at this operation — deducted from what the MO can produce. */
  qty_scrapped?: number;
  scrap_reason?: string | null;
}

export function useMoWorkOrders(moId: string | undefined) {
  return useQuery({
    queryKey: ['mo_work_orders', moId],
    enabled: !!moId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('mo_work_orders' as never)
        .select('*')
        .eq('mo_id', moId as string)
        .order('sequence', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as MoWorkOrder[];
    },
  });
}

export function useGenerateMoWorkOrders() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (args: { p_mo_id: string }) => {
      const { data, error } = await supabase.rpc('generate_mo_work_orders' as never, args as never);
      if (error) throw error;
      return data as {
        success: boolean;
        work_orders_created: number;
        total_planned_minutes: number;
        total_planned_labor_cost_cents: number;
      };
    },
    onSuccess: (data, vars) => {
      toast({
        title: `Generated ${data.work_orders_created} work order(s)`,
        description: `Planned labor ${(data.total_planned_labor_cost_cents / 100).toFixed(2)}`,
      });
      qc.invalidateQueries({ queryKey: ['mo_work_orders', vars.p_mo_id] });
    },
    onError: (e: Error) =>
      toast({ title: 'Generate work orders failed', description: e.message, variant: 'destructive' }),
  });
}

export function useProgressWorkOrder() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (args: {
      p_work_order_id: string;
      p_action: 'start' | 'pause' | 'done' | 'cancel';
      p_actual_minutes?: number;
    }) => {
      const { data, error } = await supabase.rpc('progress_work_order' as never, args as never);
      if (error) throw error;
      return data as unknown as {
        success: boolean;
        mo_id: string;
        status: string;
        actual_minutes: number | null;
        actual_labor_cost_cents: number | null;
        variance_minutes: number;
        mo_open_work_orders: number;
      };
    },
    onSuccess: (data, vars) => {
      if (vars.p_action === 'done') {
        const sign = data.variance_minutes > 0 ? '+' : '';
        toast({
          title: 'Work order finished',
          description:
            `${data.actual_minutes ?? 0} min (${sign}${Number(data.variance_minutes).toFixed(0)} vs plan)` +
            (data.mo_open_work_orders === 0
              ? ' · all operations done'
              : ` · ${data.mo_open_work_orders} left`),
        });
      }
      qc.invalidateQueries({ queryKey: ['mo_work_orders', data.mo_id] });
      qc.invalidateQueries({ queryKey: ['manufacturing_orders'] });
    },
    onError: (e: Error) =>
      toast({ title: 'Work order update failed', description: e.message, variant: 'destructive' }),
  });
}


