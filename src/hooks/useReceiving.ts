import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

// ============================================================
// Types
// ============================================================

export interface OpenPo {
  id: string;
  po_number: string;
  vendor_id: string;
  status: 'sent' | 'confirmed' | 'partially_received';
  order_date: string;
  expected_delivery: string | null;
  total_cents: number;
  currency: string;
  vendors?: { name: string } | null;
  lines_summary?: { total_lines: number; remaining_lines: number };
}

export interface OpenPoLine {
  id: string;
  description: string;
  quantity: number;
  received_quantity: number;
  unit_price_cents: number;
  product_id: string | null;
}

export interface ReceiveLineInput {
  po_line_id: string;
  quantity_received: number;
  lot_number?: string;
  expiration_date?: string;
}

// ============================================================
// Query: open POs awaiting goods
// ============================================================

export function useOpenPurchaseOrders() {
  return useQuery({
    queryKey: ['open-pos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('purchase_orders')
        .select('*, vendors(name)')
        .in('status', ['sent', 'confirmed', 'partially_received'])
        .order('expected_delivery', { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as OpenPo[];
    },
  });
}

export function useOpenPoLines(poId: string | null) {
  return useQuery({
    queryKey: ['open-po-lines', poId],
    enabled: !!poId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('purchase_order_lines')
        .select('id, description, quantity, received_quantity, unit_price_cents, product_id')
        .eq('purchase_order_id', poId!)
        .order('created_at');
      if (error) throw error;
      return (data ?? []) as OpenPoLine[];
    },
  });
}

// ============================================================
// Query: recent goods receipts (across all POs)
// ============================================================

export interface GoodsReceiptRow {
  id: string;
  purchase_order_id: string;
  received_date: string;
  notes: string | null;
  created_at: string;
  purchase_orders?: { po_number: string; vendor_id: string; vendors?: { name: string } | null } | null;
  goods_receipt_lines?: { quantity_received: number }[];
}

export function useRecentGoodsReceipts(limit = 25) {
  return useQuery({
    queryKey: ['recent-goods-receipts', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('goods_receipts')
        .select('id, purchase_order_id, received_date, notes, created_at, goods_receipt_lines(quantity_received), purchase_orders(po_number, vendor_id, vendors(name))')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as unknown as GoodsReceiptRow[];
    },
  });
}

// ============================================================
// Mutation: receive PO via SECURITY DEFINER RPC
// ============================================================

export function useReceivePurchaseOrder() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (input: {
      purchase_order_id: string;
      lines: ReceiveLineInput[];
      to_location_id?: string;
      received_date?: string;
      notes?: string;
    }) => {
      const { data, error } = await supabase.rpc('receive_purchase_order' as never, {
        p_purchase_order_id: input.purchase_order_id,
        p_lines: input.lines as never,
        p_to_location_id: input.to_location_id ?? null,
        p_received_date: input.received_date ?? null,
        p_notes: input.notes ?? null,
      } as never);
      if (error) throw error;
      return data as { receipt_id: string; po_status: string; lines_received: number; total_quantity: number };
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['open-pos'] });
      qc.invalidateQueries({ queryKey: ['open-po-lines'] });
      qc.invalidateQueries({ queryKey: ['recent-goods-receipts'] });
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      toast({
        title: 'Goods receipt recorded',
        description: `${res.lines_received} line(s), ${res.total_quantity} units received. PO is now ${res.po_status}.`,
      });
    },
    onError: (err: Error) => {
      toast({ title: 'Receipt failed', description: err.message, variant: 'destructive' });
    },
  });
}

// ============================================================
// Realtime: toast on goods.received events
// ============================================================

export function useReceivingRealtime() {
  const qc = useQueryClient();
  const { toast } = useToast();

  useEffect(() => {
    const ch = supabase
      .channel('goods-receipts-feed')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'goods_receipts' }, () => {
        qc.invalidateQueries({ queryKey: ['recent-goods-receipts'] });
        qc.invalidateQueries({ queryKey: ['open-pos'] });
        toast({ title: 'New goods receipt', description: 'Inventory updated.' });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc, toast]);
}
