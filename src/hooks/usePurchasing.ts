import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

// ============================================================
// Types
// ============================================================

export interface Vendor {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  website: string | null;
  payment_terms: string | null;
  currency: string;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  created_by: string | null;
}

export interface PurchaseOrder {
  id: string;
  po_number: string;
  vendor_id: string;
  order_date: string;
  expected_delivery: string | null;
  status: string;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  currency: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  vendors?: { name: string };
}

export interface PurchaseOrderLine {
  id: string;
  purchase_order_id: string;
  product_id: string | null;
  description: string;
  quantity: number;
  unit_price_cents: number;
  tax_rate: number;
  total_cents: number;
  received_quantity: number;
}

export interface GoodsReceipt {
  id: string;
  purchase_order_id: string;
  received_date: string;
  received_by: string | null;
  notes: string | null;
  created_at: string;
}

export interface GoodsReceiptLine {
  id: string;
  goods_receipt_id: string;
  po_line_id: string;
  quantity_received: number;
}

// ============================================================
// Vendors
// ============================================================

export function useVendors(activeOnly = false) {
  return useQuery({
    queryKey: ['vendors', activeOnly],
    queryFn: async () => {
      let query = supabase.from('vendors').select('*').order('name');
      if (activeOnly) query = query.eq('is_active', true);
      const { data, error } = await query;
      if (error) throw error;
      return data as Vendor[];
    },
  });
}

// ============================================================
// Purchase Orders
// ============================================================

export function usePurchaseOrders(statusFilter?: string) {
  return useQuery({
    queryKey: ['purchase-orders', statusFilter],
    queryFn: async () => {
      let query = supabase
        .from('purchase_orders')
        .select('*, vendors(name)')
        .order('created_at', { ascending: false });
      if (statusFilter && statusFilter !== 'all') {
        query = query.eq('status', statusFilter as any);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data as PurchaseOrder[];
    },
  });
}

export function usePurchaseOrderWithLines(poId: string | null) {
  return useQuery({
    queryKey: ['purchase-order', poId],
    enabled: !!poId,
    queryFn: async () => {
      const { data: po, error } = await supabase
        .from('purchase_orders')
        .select('*')
        .eq('id', poId!)
        .single();
      if (error) throw error;

      const { data: lines } = await supabase
        .from('purchase_order_lines')
        .select('*')
        .eq('purchase_order_id', poId!)
        .order('created_at');

      return { ...po, lines: lines || [] } as PurchaseOrder & { lines: PurchaseOrderLine[] };
    },
  });
}

// ============================================================
// Goods Receipts
// ============================================================

export function useGoodsReceipts(poId: string) {
  return useQuery({
    queryKey: ['goods-receipts', poId],
    enabled: !!poId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('goods_receipts')
        .select('*, goods_receipt_lines(*)')
        .eq('purchase_order_id', poId)
        .order('receipt_date', { ascending: false });
      if (error) throw error;
      return data as unknown as (GoodsReceipt & { goods_receipt_lines: GoodsReceiptLine[] })[];
    },
  });
}

export interface CreateGoodsReceiptInput {
  purchase_order_id: string;
  receipt_date: string;
  notes?: string;
  received_by?: string;
  lines: { po_line_id: string; quantity_received: number }[];
}

export function useCreateGoodsReceipt() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (input: CreateGoodsReceiptInput) => {
      const { data: receipt, error: receiptError } = await supabase
        .from('goods_receipts')
        .insert({
          purchase_order_id: input.purchase_order_id,
          received_date: input.receipt_date,
          notes: input.notes || null,
          received_by: input.received_by || null,
        })
        .select()
        .single();
      if (receiptError) throw receiptError;

      const { error: linesError } = await supabase
        .from('goods_receipt_lines')
        .insert(
          input.lines.map((l) => ({
            goods_receipt_id: receipt.id,
            po_line_id: l.po_line_id,
            quantity_received: l.quantity_received,
          }))
        );
      if (linesError) throw linesError;

      // Update received quantities on PO lines + sync inventory
      for (const line of input.lines) {
        const { data: poLine } = await supabase
          .from('purchase_order_lines')
          .select('received_quantity, product_id')
          .eq('id', line.po_line_id)
          .single();
        if (poLine) {
          await supabase
            .from('purchase_order_lines')
            .update({ received_quantity: poLine.received_quantity + line.quantity_received })
            .eq('id', line.po_line_id);

          // Auto-update inventory if product is tracked
          if (poLine.product_id) {
            const { data: stockRow } = await supabase
              .from('product_stock')
              .select('id, quantity_on_hand')
              .eq('product_id', poLine.product_id)
              .maybeSingle();

            if (stockRow) {
              // Create stock move (in)
              await supabase.from('stock_moves').insert({
                product_id: poLine.product_id,
                quantity: line.quantity_received,
                move_type: 'in',
                reference_type: 'goods_receipt',
                reference_id: receipt.id,
                notes: `PO goods receipt – ${line.quantity_received} units received`,
              });

              // Update on-hand quantity
              await supabase
                .from('product_stock')
                .update({ quantity_on_hand: stockRow.quantity_on_hand + line.quantity_received })
                .eq('product_id', poLine.product_id);
            }
          }
        }
      }

      // Check if PO is fully received
      const { data: allLines } = await supabase
        .from('purchase_order_lines')
        .select('quantity, received_quantity')
        .eq('purchase_order_id', input.purchase_order_id);

      if (allLines) {
        const allReceived = allLines.every((l) => l.received_quantity >= l.quantity);
        const someReceived = allLines.some((l) => l.received_quantity > 0);
        const newStatus = allReceived ? 'received' : someReceived ? 'partially_received' : undefined;
        if (newStatus) {
          await supabase
            .from('purchase_orders')
            .update({ status: newStatus })
            .eq('id', input.purchase_order_id);
        }
      }

      return receipt;
    },
    onSuccess: (_, input) => {
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      qc.invalidateQueries({ queryKey: ['purchase-order', input.purchase_order_id] });
      qc.invalidateQueries({ queryKey: ['goods-receipts', input.purchase_order_id] });
      toast({ title: 'Goods receipt recorded' });
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });
}
