import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface StockLocation {
  id: string;
  code: string;
  name: string;
  location_type: 'internal' | 'vendor' | 'customer' | 'transit' | 'scrap' | 'production' | 'view';
  parent_id: string | null;
  is_active: boolean;
  notes: string | null;
}

export interface StockQuant {
  id: string;
  product_id: string;
  location_id: string;
  lot_id: string | null;
  quantity: number;
  reserved_quantity: number;
  updated_at: string;
  products?: { name: string; currency: string | null };
  stock_locations?: { code: string; name: string };
  stock_lots?: { lot_number: string; expiry_date: string | null } | null;
}

export interface ReorderRule {
  id: string;
  product_id: string;
  location_id: string;
  min_qty: number;
  max_qty: number;
  reorder_qty: number | null;
  lead_time_days: number;
  preferred_vendor_id: string | null;
  procurement_method: 'buy' | 'manufacture';
  is_active: boolean;
  products?: { name: string };
  stock_locations?: { code: string };
  vendors?: { name: string } | null;
}

export interface ProcurementSuggestion {
  id: string;
  product_id: string;
  location_id: string;
  suggested_qty: number;
  procurement_method: 'buy' | 'manufacture';
  preferred_vendor_id: string | null;
  needed_by: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'materialized';
  reasoning: Record<string, number> | null;
  materialized_ref_type: string | null;
  materialized_ref_id: string | null;
  created_at: string;
  products?: { name: string };
  stock_locations?: { code: string };
  vendors?: { name: string } | null;
}

export function useStockLocations() {
  return useQuery({
    queryKey: ['stock_locations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stock_locations' as never)
        .select('*')
        .order('code');
      if (error) throw error;
      return (data ?? []) as unknown as StockLocation[];
    },
  });
}

export function useStockQuants(locationId?: string) {
  return useQuery({
    queryKey: ['stock_quants', locationId ?? 'all'],
    queryFn: async () => {
      let q = supabase
        .from('stock_quants' as never)
        .select('*, products(name, currency), stock_locations(code, name), stock_lots(lot_number, expiry_date)')
        .order('updated_at', { ascending: false })
        .limit(500);
      if (locationId) q = q.eq('location_id', locationId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as StockQuant[];
    },
  });
}

export function useReorderRules() {
  return useQuery({
    queryKey: ['reorder_rules'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reorder_rules' as never)
        .select('*, products(name), stock_locations(code), vendors(name)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ReorderRule[];
    },
  });
}

export function useProcurementSuggestions(status: 'pending' | 'all' = 'pending') {
  return useQuery({
    queryKey: ['procurement_suggestions', status],
    queryFn: async () => {
      let q = supabase
        .from('procurement_suggestions' as never)
        .select('*, products(name), stock_locations(code), vendors(name)')
        .order('created_at', { ascending: false })
        .limit(200);
      if (status === 'pending') q = q.eq('status', 'pending');
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as ProcurementSuggestion[];
    },
  });
}

export function useRunProcurement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('procurement_run' as never);
      if (error) throw error;
      return (data as { suggestions_created: number; rules_evaluated: number }[])[0];
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['procurement_suggestions'] });
      toast.success(`Procurement run: ${r?.suggestions_created ?? 0} new suggestions (${r?.rules_evaluated ?? 0} rules evaluated)`);
    },
    onError: (e: Error) => toast.error(`Procurement run failed: ${e.message}`),
  });
}

export function useApproveSuggestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc('approve_procurement_suggestion' as never, { p_id: id } as never);
      if (error) throw error;
      return data as { type: string; id: string; po_number?: string };
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['procurement_suggestions'] });
      qc.invalidateQueries({ queryKey: ['purchase_orders'] });
      toast.success(`Materialized ${r?.type === 'purchase_order' ? `PO ${r.po_number}` : 'manufacturing order'}`);
    },
    onError: (e: Error) => toast.error(`Approve failed: ${e.message}`),
  });
}

export function useRejectSuggestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string }) => {
      const { error } = await supabase.rpc('reject_procurement_suggestion' as never, { p_id: id, p_reason: reason ?? null } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['procurement_suggestions'] });
      toast.success('Suggestion rejected');
    },
    onError: (e: Error) => toast.error(`Reject failed: ${e.message}`),
  });
}

export function useUpsertReorderRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rule: Partial<ReorderRule> & { product_id: string; location_id: string; min_qty: number; max_qty: number }) => {
      const { error } = await supabase
        .from('reorder_rules' as never)
        .upsert(rule as never, { onConflict: 'product_id,location_id' });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reorder_rules'] });
      toast.success('Reorder rule saved');
    },
    onError: (e: Error) => toast.error(`Save failed: ${e.message}`),
  });
}

export function useTransferStock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { product_id: string; from_location_id: string; to_location_id: string; quantity: number; lot_id?: string; notes?: string }) => {
      const { error } = await supabase.rpc('transfer_stock' as never, {
        p_product_id: args.product_id,
        p_from_location_id: args.from_location_id,
        p_to_location_id: args.to_location_id,
        p_quantity: args.quantity,
        p_lot_id: args.lot_id ?? null,
        p_notes: args.notes ?? null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stock_quants'] });
      toast.success('Stock transferred');
    },
    onError: (e: Error) => toast.error(`Transfer failed: ${e.message}`),
  });
}
