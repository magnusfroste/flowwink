import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface ProductStock {
  id: string;
  product_id: string;
  quantity_on_hand: number;
  quantity_reserved: number;
  reorder_point: number;
  last_counted_at: string | null;
  updated_at: string;
  created_at: string;
  products?: { name: string; price_cents: number; currency: string; status: string } | null;
}

export interface StockMove {
  id: string;
  product_id: string;
  quantity: number;
  move_type: string;
  reference_type: string | null;
  reference_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  products?: { name: string } | null;
}

export function useProductStock() {
  return useQuery({
    queryKey: ['product-stock'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('product_stock')
        .select('*, products(name, price_cents, currency, status)')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as ProductStock[];
    },
  });
}

export function useStockMoves(productId?: string) {
  return useQuery({
    queryKey: ['stock-moves', productId],
    queryFn: async () => {
      let query = supabase
        .from('stock_moves')
        .select('*, products(name)')
        .order('created_at', { ascending: false })
        .limit(100);
      if (productId) query = query.eq('product_id', productId);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as StockMove[];
    },
  });
}

export function useAdjustStock() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (input: {
      product_id: string;
      quantity: number;
      move_type: 'in' | 'out' | 'adjustment';
      notes?: string;
    }) => {
      // Create stock move
      const { error: moveErr } = await supabase.from('stock_moves').insert({
        product_id: input.product_id,
        quantity: input.move_type === 'out' ? -Math.abs(input.quantity) : Math.abs(input.quantity),
        move_type: input.move_type,
        reference_type: 'manual',
        notes: input.notes || null,
      });
      if (moveErr) throw moveErr;

      // Upsert stock level
      const delta = input.move_type === 'out' ? -Math.abs(input.quantity) : Math.abs(input.quantity);
      
      // Check if stock record exists
      const { data: existing } = await supabase
        .from('product_stock')
        .select('id, quantity_on_hand')
        .eq('product_id', input.product_id)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from('product_stock')
          .update({ quantity_on_hand: existing.quantity_on_hand + delta })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('product_stock')
          .insert({ product_id: input.product_id, quantity_on_hand: Math.max(0, delta) });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['product-stock'] });
      qc.invalidateQueries({ queryKey: ['stock-moves'] });
      toast({ title: 'Stock adjusted' });
    },
    onError: (e) => {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    },
  });
}

export function useSetReorderPoint() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (input: { product_id: string; reorder_point: number }) => {
      // Upsert
      const { data: existing } = await supabase
        .from('product_stock')
        .select('id')
        .eq('product_id', input.product_id)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from('product_stock')
          .update({ reorder_point: input.reorder_point })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('product_stock')
          .insert({ product_id: input.product_id, reorder_point: input.reorder_point });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['product-stock'] });
      toast({ title: 'Reorder point updated' });
    },
  });
}

export function useInitializeStock() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (productId: string) => {
      const { error } = await supabase
        .from('product_stock')
        .insert({ product_id: productId, quantity_on_hand: 0, reorder_point: 0 });
      if (error && !error.message.includes('duplicate')) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['product-stock'] });
      toast({ title: 'Stock tracking enabled' });
    },
  });
}
