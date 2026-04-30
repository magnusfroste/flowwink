import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

// ============================================================
// Types
// ============================================================

export type VendorInvoiceStatus = 'draft' | 'registered' | 'approved' | 'paid' | 'cancelled';
export type MatchStatus = 'unmatched' | 'matched' | 'over_invoiced' | 'under_invoiced' | 'no_po';

export interface VendorInvoice {
  id: string;
  invoice_number: string;
  vendor_id: string;
  purchase_order_id: string | null;
  invoice_date: string;
  due_date: string | null;
  status: VendorInvoiceStatus;
  match_status: MatchStatus;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  variance_cents: number;
  variance_notes: string | null;
  currency: string;
  notes: string | null;
  approved_at: string | null;
  approved_by: string | null;
  paid_at: string | null;
  created_at: string;
  vendors?: { name: string } | null;
  purchase_orders?: { po_number: string; status: string } | null;
}

export interface PoMatchSummary {
  purchase_order_id: string;
  invoice_count: number;
  matched_count: number;
  approved_count: number;
  total_invoiced_cents: number;
  worst_status: MatchStatus | null;
}

// ============================================================
// Queries
// ============================================================

export function useVendorInvoices(filter?: { status?: VendorInvoiceStatus | 'all'; matchStatus?: MatchStatus | 'all' }) {
  return useQuery({
    queryKey: ['vendor-invoices', filter?.status ?? 'all', filter?.matchStatus ?? 'all'],
    queryFn: async () => {
      let q = supabase
        .from('vendor_invoices')
        .select('*, vendors(name), purchase_orders(po_number, status)')
        .order('created_at', { ascending: false })
        .limit(500);
      if (filter?.status && filter.status !== 'all') q = q.eq('status', filter.status);
      if (filter?.matchStatus && filter.matchStatus !== 'all') q = q.eq('match_status', filter.matchStatus);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as VendorInvoice[];
    },
  });
}

/** Aggregated invoice/match status per PO — used to render a small badge in the PO list. */
export function usePoMatchSummaries(poIds: string[]) {
  return useQuery({
    queryKey: ['po-match-summary', [...poIds].sort().join(',')],
    enabled: poIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vendor_invoices')
        .select('purchase_order_id, match_status, status, total_cents')
        .in('purchase_order_id', poIds);
      if (error) throw error;

      const map = new Map<string, PoMatchSummary>();
      const severity: Record<MatchStatus, number> = {
        matched: 0,
        no_po: 1,
        unmatched: 2,
        under_invoiced: 3,
        over_invoiced: 4,
      };
      for (const row of (data ?? []) as Array<{
        purchase_order_id: string | null;
        match_status: MatchStatus;
        status: VendorInvoiceStatus;
        total_cents: number;
      }>) {
        if (!row.purchase_order_id) continue;
        const cur = map.get(row.purchase_order_id) ?? {
          purchase_order_id: row.purchase_order_id,
          invoice_count: 0,
          matched_count: 0,
          approved_count: 0,
          total_invoiced_cents: 0,
          worst_status: null,
        };
        cur.invoice_count += 1;
        cur.total_invoiced_cents += row.total_cents;
        if (row.match_status === 'matched') cur.matched_count += 1;
        if (row.status === 'approved' || row.status === 'paid') cur.approved_count += 1;
        if (cur.worst_status == null || severity[row.match_status] > severity[cur.worst_status]) {
          cur.worst_status = row.match_status;
        }
        map.set(row.purchase_order_id, cur);
      }
      return Array.from(map.values());
    },
  });
}

// ============================================================
// Mutations — manual re-match / approve overrides
// ============================================================

export function useMatchInvoice() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (invoiceId: string) => {
      const { data, error } = await supabase.rpc('match_invoice_to_receipt' as never, {
        p_vendor_invoice_id: invoiceId,
      } as never);
      if (error) throw error;
      return data as { match_status: MatchStatus; variance_cents: number };
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['vendor-invoices'] });
      qc.invalidateQueries({ queryKey: ['po-match-summary'] });
      toast({ title: 'Re-matched', description: `Status: ${res.match_status}, variance ${(res.variance_cents / 100).toFixed(2)}` });
    },
    onError: (err: Error) => toast({ title: 'Match failed', description: err.message, variant: 'destructive' }),
  });
}

export function useAutoApproveInvoice() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (invoiceId: string) => {
      const { data, error } = await supabase.rpc('auto_approve_vendor_invoice' as never, {
        p_vendor_invoice_id: invoiceId,
      } as never);
      if (error) throw error;
      return data as { approved: boolean; reason?: string };
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['vendor-invoices'] });
      toast({
        title: res.approved ? 'Auto-approved' : 'Not eligible',
        description: res.reason ?? (res.approved ? 'Invoice marked as approved.' : 'Match status prevented auto-approval.'),
        variant: res.approved ? 'default' : 'destructive',
      });
    },
    onError: (err: Error) => toast({ title: 'Approve failed', description: err.message, variant: 'destructive' }),
  });
}

// ============================================================
// Realtime
// ============================================================

export function useVendorInvoicesRealtime() {
  const qc = useQueryClient();
  useEffect(() => {
    const ch = supabase
      .channel('vendor-invoices-feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vendor_invoices' }, () => {
        qc.invalidateQueries({ queryKey: ['vendor-invoices'] });
        qc.invalidateQueries({ queryKey: ['po-match-summary'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);
}

// ============================================================
// Display helpers
// ============================================================

export const MATCH_STATUS_LABEL: Record<MatchStatus, string> = {
  unmatched: 'Unmatched',
  matched: 'Matched',
  over_invoiced: 'Over-invoiced',
  under_invoiced: 'Under-invoiced',
  no_po: 'No PO',
};

export const MATCH_STATUS_COLOR: Record<MatchStatus, string> = {
  matched: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  unmatched: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  over_invoiced: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  under_invoiced: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  no_po: 'bg-muted text-muted-foreground',
};

export const INVOICE_STATUS_LABEL: Record<VendorInvoiceStatus, string> = {
  draft: 'Draft',
  registered: 'Registered',
  approved: 'Approved',
  paid: 'Paid',
  cancelled: 'Cancelled',
};

export const INVOICE_STATUS_COLOR: Record<VendorInvoiceStatus, string> = {
  draft: 'bg-muted text-muted-foreground',
  registered: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  approved: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  paid: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  cancelled: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
};
