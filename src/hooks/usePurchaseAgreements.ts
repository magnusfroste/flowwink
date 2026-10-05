import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

/**
 * Blanket purchase agreements and their call-offs. Both the admin panel and
 * the agent go through the same two RPCs (manage_purchase_agreement,
 * call_off_purchase_agreement), so "what is left" is computed in one place:
 * from the call-off lines on orders that are not cancelled.
 */

export type AgreementStatus = 'draft' | 'active' | 'closed' | 'cancelled';

export interface AgreementSummary {
  id: string;
  agreement_number: string;
  status: AgreementStatus;
  vendor_id: string;
  vendor_name: string | null;
  start_date: string;
  end_date: string | null;
  agreed_quantity: number;
  called_quantity: number;
}

export interface AgreementLine {
  id: string;
  product_id: string | null;
  description: string;
  agreed_quantity: number;
  unit_price_cents: number;
  tax_rate: number;
  called_quantity: number;
  remaining_quantity: number;
  received_quantity: number;
}

export interface AgreementSnapshot {
  agreement: AgreementSummary & { currency: string | null; notes: string | null };
  lines: AgreementLine[];
  call_offs: Array<{ id: string; po_number: string; status: string; order_date: string; total_cents: number }>;
}

export interface NewAgreementLine {
  product_id?: string | null;
  description?: string;
  quantity: number;
  unit_price_cents: number;
  tax_rate?: number;
}

type Rpc = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
const rpc = (fn: string, args: Record<string, unknown>) => (supabase.rpc as unknown as Rpc)(fn, args);

async function call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export function usePurchaseAgreements() {
  return useQuery({
    queryKey: ['purchase-agreements'],
    queryFn: async () => (await call<{ agreements: AgreementSummary[] }>('manage_purchase_agreement', { p_action: 'list' })).agreements,
  });
}

export function usePurchaseAgreement(id: string | null) {
  return useQuery({
    queryKey: ['purchase-agreement', id],
    enabled: !!id,
    queryFn: () => call<AgreementSnapshot>('manage_purchase_agreement', { p_action: 'get', p_agreement_id: id }),
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return (id?: string) => {
    qc.invalidateQueries({ queryKey: ['purchase-agreements'] });
    if (id) qc.invalidateQueries({ queryKey: ['purchase-agreement', id] });
  };
}

export function useCreatePurchaseAgreement() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (v: { vendor_id: string; start_date?: string; end_date?: string; notes?: string; lines: NewAgreementLine[] }) =>
      call<{ agreement_id: string; agreement_number: string }>('manage_purchase_agreement', {
        p_action: 'create',
        p_vendor_id: v.vendor_id,
        p_start_date: v.start_date || null,
        p_end_date: v.end_date || null,
        p_notes: v.notes || null,
        p_lines: v.lines,
      }),
    onSuccess: (r) => { invalidate(r.agreement_id); toast.success(`Agreement ${r.agreement_number} created as draft`); },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useAgreementTransition() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (v: { id: string; action: 'activate' | 'close' | 'cancel' }) =>
      call<AgreementSnapshot>('manage_purchase_agreement', { p_action: v.action, p_agreement_id: v.id }),
    onSuccess: (_r, v) => { invalidate(v.id); toast.success(`Agreement ${v.action === 'activate' ? 'activated' : v.action === 'close' ? 'closed' : 'cancelled'}`); },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useCallOffAgreement() {
  const invalidate = useInvalidate();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; lines: Array<{ agreement_line_id: string; quantity: number }>; expected_delivery?: string }) =>
      call<{ purchase_order_id: string; po_number: string }>('call_off_purchase_agreement', {
        p_agreement_id: v.id,
        p_lines: v.lines,
        p_expected_delivery: v.expected_delivery || null,
      }),
    onSuccess: (r, v) => {
      invalidate(v.id);
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      toast.success(`Call-off ${r.po_number} created as a draft purchase order`);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
