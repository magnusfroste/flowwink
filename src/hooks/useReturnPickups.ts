import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface ReturnPickupRow {
  id: string;
  pickup_number: string;
  rma_id: string;
  pickup_date: string;
  pickup_window: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  postal_code: string | null;
  country: string | null;
  carrier: string | null;
  tracking_reference: string | null;
  status: 'requested' | 'scheduled' | 'picked_up' | 'failed' | 'cancelled';
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export function useReturnPickups(rmaId?: string) {
  return useQuery({
    queryKey: ['return-pickups', rmaId],
    enabled: !!rmaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('return_pickups' as any)
        .select('*')
        .eq('rma_id', rmaId!)
        .order('pickup_date', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ReturnPickupRow[];
    },
  });
}

export function useSchedulePickup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      rma_id: string; pickup_date: string; carrier?: string;
      address_line1?: string; address_line2?: string; city?: string;
      postal_code?: string; country?: string; pickup_window?: string; notes?: string;
    }) => {
      const { data, error } = await supabase.rpc('schedule_return_pickup' as any, {
        p_rma_id: args.rma_id,
        p_pickup_date: args.pickup_date,
        p_carrier: args.carrier ?? null,
        p_address_line1: args.address_line1 ?? null,
        p_address_line2: args.address_line2 ?? null,
        p_city: args.city ?? null,
        p_postal_code: args.postal_code ?? null,
        p_country: args.country ?? null,
        p_pickup_window: args.pickup_window ?? null,
        p_notes: args.notes ?? null,
      });
      if (error) throw error;
      return data as ReturnPickupRow;
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['return-pickups', r.rma_id] });
      toast.success(`Pickup ${r.pickup_number} scheduled`);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdatePickup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { pickup_id: string; status?: string; tracking_reference?: string; pickup_date?: string }) => {
      const { data, error } = await supabase.rpc('update_return_pickup' as any, {
        p_pickup_id: args.pickup_id,
        p_status: args.status ?? null,
        p_tracking_reference: args.tracking_reference ?? null,
        p_pickup_date: args.pickup_date ?? null,
      });
      if (error) throw error;
      return data as ReturnPickupRow;
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['return-pickups', r.rma_id] });
      toast.success('Pickup updated');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
