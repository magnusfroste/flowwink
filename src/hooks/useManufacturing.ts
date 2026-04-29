import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

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
      return (data ?? []) as Array<Record<string, unknown>>;
    },
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
