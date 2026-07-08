import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// ---------- Receipts (multi-step) ----------
export interface InventoryReceipt {
  id: string;
  reference: string;
  purchase_order_id: string | null;
  vendor_id: string | null;
  status: 'received' | 'quality_check' | 'putaway' | 'done' | 'cancelled';
  received_at: string;
  qc_at: string | null;
  putaway_at: string | null;
  done_at: string | null;
  notes: string | null;
  created_at: string;
}

export interface InventoryReceiptLine {
  id: string;
  receipt_id: string;
  product_id: string;
  lot_id: string | null;
  quantity: number;
  qc_status: 'pending' | 'passed' | 'failed';
  qc_notes: string | null;
  target_location_id: string | null;
  putaway_move_id: string | null;
  products?: { name: string } | null;
}

export function useInventoryReceipts() {
  return useQuery({
    queryKey: ['inventory-receipts'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('inventory_receipts')
        .select('*')
        .order('received_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as InventoryReceipt[];
    },
  });
}

export function useInventoryReceiptLines(receiptId: string | null) {
  return useQuery({
    queryKey: ['inventory-receipt-lines', receiptId],
    enabled: !!receiptId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('inventory_receipt_lines')
        .select('*, products(name)')
        .eq('receipt_id', receiptId!)
        .order('created_at');
      if (error) throw error;
      return (data ?? []) as InventoryReceiptLine[];
    },
  });
}

export function useCreateReceipt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { vendor_id?: string; purchase_order_id?: string; notes?: string; lines: { product_id: string; quantity: number; target_location_id?: string; lot_id?: string }[] }) => {
      const { data: rcp, error } = await (supabase as any)
        .from('inventory_receipts')
        .insert({ vendor_id: input.vendor_id ?? null, purchase_order_id: input.purchase_order_id ?? null, notes: input.notes ?? null })
        .select('id, reference')
        .single();
      if (error) throw error;
      if (input.lines.length) {
        const { error: e2 } = await (supabase as any)
          .from('inventory_receipt_lines')
          .insert(input.lines.map(l => ({ ...l, receipt_id: rcp.id })));
        if (e2) throw e2;
      }
      return rcp;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory-receipts'] });
      toast.success('Receipt created');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useAdvanceReceipt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { receipt_id: string; to_status: 'quality_check' | 'putaway' | 'done' | 'cancelled' }) => {
      const { data, error } = await (supabase as any).rpc('advance_inventory_receipt', {
        p_receipt_id: input.receipt_id,
        p_to_status: input.to_status,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory-receipts'] });
      qc.invalidateQueries({ queryKey: ['inventory-receipt-lines'] });
      toast.success('Receipt updated');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateReceiptLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; qc_status?: string; qc_notes?: string; target_location_id?: string }) => {
      const { id, ...patch } = input;
      const { error } = await (supabase as any).from('inventory_receipt_lines').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inventory-receipt-lines'] }),
  });
}

// ---------- Transfers ----------
export interface InventoryTransfer {
  id: string;
  reference: string;
  from_location_id: string;
  to_location_id: string;
  status: 'draft' | 'in_transit' | 'done' | 'cancelled';
  scheduled_date: string | null;
  completed_at: string | null;
  notes: string | null;
  created_at: string;
}

export interface InventoryTransferLine {
  id: string;
  transfer_id: string;
  product_id: string;
  lot_id: string | null;
  quantity: number;
  move_id: string | null;
  products?: { name: string } | null;
}

export function useInventoryTransfers() {
  return useQuery({
    queryKey: ['inventory-transfers'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('inventory_transfers')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as InventoryTransfer[];
    },
  });
}

export function useInventoryTransferLines(transferId: string | null) {
  return useQuery({
    queryKey: ['inventory-transfer-lines', transferId],
    enabled: !!transferId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('inventory_transfer_lines')
        .select('*, products(name)')
        .eq('transfer_id', transferId!)
        .order('created_at');
      if (error) throw error;
      return (data ?? []) as InventoryTransferLine[];
    },
  });
}

export function useCreateTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { from_location_id: string; to_location_id: string; notes?: string; scheduled_date?: string; lines: { product_id: string; quantity: number; lot_id?: string }[] }) => {
      const { data: tr, error } = await (supabase as any)
        .from('inventory_transfers')
        .insert({
          from_location_id: input.from_location_id,
          to_location_id: input.to_location_id,
          notes: input.notes ?? null,
          scheduled_date: input.scheduled_date ?? null,
        })
        .select('id, reference')
        .single();
      if (error) throw error;
      if (input.lines.length) {
        const { error: e2 } = await (supabase as any)
          .from('inventory_transfer_lines')
          .insert(input.lines.map(l => ({ ...l, transfer_id: tr.id })));
        if (e2) throw e2;
      }
      return tr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory-transfers'] });
      toast.success('Transfer created');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useCompleteTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (transfer_id: string) => {
      const { data, error } = await (supabase as any).rpc('complete_inventory_transfer', { p_transfer_id: transfer_id });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory-transfers'] });
      qc.invalidateQueries({ queryKey: ['product-stock'] });
      toast.success('Transfer posted');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

// ---------- Expiring lots (FEFO) ----------
export interface ExpiringLot {
  lot_id: string;
  product_id: string;
  lot_number: string;
  expiry_date: string;
  product_name: string;
  days_until_expiry: number;
  on_hand_qty: number;
}

export function useExpiringLots(withinDays = 60) {
  return useQuery({
    queryKey: ['expiring-lots', withinDays],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('list_expiring_lots', { p_within_days: withinDays });
      if (error) throw error;
      return (data ?? []) as ExpiringLot[];
    },
  });
}

// ---------- ABC analysis ----------
export interface AbcRow {
  product_id: string;
  product_name: string;
  units_out: number;
  value_out_cents: number;
  abc_class: 'A' | 'B' | 'C';
  is_slow_mover: boolean;
}

export function useAbcAnalysis(days = 90) {
  return useQuery({
    queryKey: ['abc-analysis', days],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('abc_analysis_report', { p_days: days });
      if (error) throw error;
      return (data ?? []) as AbcRow[];
    },
  });
}
