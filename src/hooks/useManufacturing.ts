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
