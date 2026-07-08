import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface ReturnToVendorRow {
  id: string;
  rtv_number: string;
  rma_id: string;
  vendor_id: string | null;
  status: 'draft' | 'sent' | 'credited' | 'cancelled';
  items: unknown;
  expected_credit_cents: number;
  credit_memo_id: string | null;
  notes: string | null;
  sent_at: string | null;
  credited_at: string | null;
  created_at: string;
  updated_at: string;
}

export function useReturnToVendor(rmaId?: string) {
  return useQuery({
    queryKey: ['rtv', rmaId],
    enabled: !!rmaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('return_to_vendor' as any)
        .select('*')
        .eq('rma_id', rmaId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ReturnToVendorRow[];
    },
  });
}

export function useCreateRtv() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { rma_id: string; vendor_id?: string | null; expected_credit_cents?: number; notes?: string; items?: unknown[] }) => {
      const { data, error } = await supabase.rpc('create_rtv' as any, {
        p_rma_id: args.rma_id,
        p_vendor_id: args.vendor_id ?? null,
        p_items: (args.items ?? []) as any,
        p_expected_credit_cents: args.expected_credit_cents ?? 0,
        p_notes: args.notes ?? null,
      });
      if (error) throw error;
      return data as ReturnToVendorRow;
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['rtv', r.rma_id] });
      toast.success(`Return-to-vendor ${r.rtv_number} created`);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateRtvStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { rtv_id: string; status: string; credit_memo_id?: string | null }) => {
      const { data, error } = await supabase.rpc('update_rtv_status' as any, {
        p_rtv_id: args.rtv_id,
        p_status: args.status,
        p_credit_memo_id: args.credit_memo_id ?? null,
      });
      if (error) throw error;
      return data as ReturnToVendorRow;
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['rtv', r.rma_id] });
      toast.success(`RTV ${r.rtv_number} → ${r.status}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
