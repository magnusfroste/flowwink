import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface ReturnItemRow {
  id: string;
  return_id: string;
  order_item_id: string | null;
  product_id: string | null;
  quantity: number;
  unit_refund_cents: number | null;
  condition: string | null;
  restock: boolean;
  suggested_action: string | null;
  chosen_action: 'restock' | 'refurbish' | 'rtv' | 'scrap' | null;
  notes: string | null;
}

export function useReturnItems(returnId?: string) {
  return useQuery({
    queryKey: ['return-items', returnId],
    enabled: !!returnId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('return_items' as any)
        .select('*')
        .eq('return_id', returnId!);
      if (error) throw error;
      return (data ?? []) as unknown as ReturnItemRow[];
    },
  });
}

export function useSetItemAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { return_item_id: string; action: string; return_id: string }) => {
      const { data, error } = await supabase.rpc('set_return_item_action' as any, {
        p_return_item_id: args.return_item_id,
        p_action: args.action,
      });
      if (error) throw error;
      return { ...(data as ReturnItemRow), return_id: args.return_id };
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['return-items', r.return_id] });
      toast.success(`Item action: ${r.chosen_action}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useAttachReturnLabel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { return_id: string; label_url?: string; tracking_number?: string; carrier_code?: string }) => {
      const { data, error } = await supabase.rpc('attach_return_label' as any, {
        p_return_id: args.return_id,
        p_label_url: args.label_url ?? null,
        p_tracking_number: args.tracking_number ?? null,
        p_carrier_code: args.carrier_code ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['returns'] });
      toast.success('Return label saved');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useSendReturnConfirmation() {
  return useMutation({
    mutationFn: async (args: { return_id: string; override_email?: string; custom_instructions?: string }) => {
      const { data, error } = await supabase.functions.invoke('send-return-confirmation', { body: args });
      if (error) throw error;
      return data as { success: boolean; sent_to: string };
    },
    onSuccess: (r) => toast.success(`Confirmation sent to ${r.sent_to}`),
    onError: (e: Error) => toast.error(e.message),
  });
}
