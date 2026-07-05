import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface InventoryCount {
  id: string;
  location_id: string;
  status: 'draft' | 'posted' | 'cancelled';
  notes: string | null;
  posted_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface InventoryCountLine {
  id: string;
  count_id: string;
  product_id: string;
  lot_id: string | null;
  system_qty: number;
  counted_qty: number;
  variance: number;
  created_at: string;
}

type RpcResult<T> = T & { success: boolean };

async function rpc<T = Record<string, unknown>>(args: Record<string, unknown>) {
  const { data, error } = await supabase.rpc(
    'manage_inventory_count',
    args as never,
  );
  if (error) throw error;
  return data as unknown as RpcResult<T>;
}

export function useInventoryCounts(locationId?: string) {
  return useQuery({
    queryKey: ['inventory_counts', locationId ?? 'all'],
    queryFn: async () => {
      const res = await rpc<{ counts: InventoryCount[] }>({
        p_action: 'list',
        p_location_id: locationId ?? null,
      });
      return res.counts ?? [];
    },
  });
}

export function useInventoryCount(countId: string | null) {
  return useQuery({
    queryKey: ['inventory_count', countId],
    enabled: !!countId,
    queryFn: async () => {
      const res = await rpc<{ count: InventoryCount; lines: InventoryCountLine[] }>({
        p_action: 'get',
        p_count_id: countId,
      });
      return { count: res.count, lines: res.lines ?? [] };
    },
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return (countId?: string | null) => {
    qc.invalidateQueries({ queryKey: ['inventory_counts'] });
    if (countId) qc.invalidateQueries({ queryKey: ['inventory_count', countId] });
  };
}

export function useCreateInventoryCount() {
  const invalidate = useInvalidate();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (input: { location_id: string; notes?: string }) =>
      rpc<{ count_id: string }>({
        p_action: 'create',
        p_location_id: input.location_id,
        p_notes: input.notes ?? null,
      }),
    onSuccess: (res) => {
      invalidate(res.count_id);
      toast({ title: 'Cycle count created' });
    },
    onError: (e: Error) => toast({ title: 'Failed', description: e.message, variant: 'destructive' }),
  });
}

export function useAddCountLine() {
  const invalidate = useInvalidate();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (input: { count_id: string; product_id: string; lot_id?: string; counted_qty?: number }) =>
      rpc<{ line_id: string; system_qty: number }>({
        p_action: 'add_line',
        p_count_id: input.count_id,
        p_product_id: input.product_id,
        p_lot_id: input.lot_id ?? null,
        p_counted_qty: input.counted_qty ?? null,
      }),
    onSuccess: (_res, vars) => invalidate(vars.count_id),
    onError: (e: Error) => toast({ title: 'Add line failed', description: e.message, variant: 'destructive' }),
  });
}

export function useSetCountLine() {
  const invalidate = useInvalidate();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (input: { count_id: string; line_id: string; counted_qty: number }) =>
      rpc({
        p_action: 'set_count',
        p_line_id: input.line_id,
        p_counted_qty: input.counted_qty,
      }),
    onSuccess: (_res, vars) => invalidate(vars.count_id),
    onError: (e: Error) => toast({ title: 'Update failed', description: e.message, variant: 'destructive' }),
  });
}

export function usePostInventoryCount() {
  const invalidate = useInvalidate();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (input: { count_id: string }) =>
      rpc<{ adjustments_applied: number }>({
        p_action: 'post',
        p_count_id: input.count_id,
      }),
    onSuccess: (res, vars) => {
      invalidate(vars.count_id);
      toast({
        title: 'Count posted',
        description: `${res.adjustments_applied ?? 0} adjustments applied to stock.`,
      });
    },
    onError: (e: Error) => toast({ title: 'Post failed', description: e.message, variant: 'destructive' }),
  });
}
