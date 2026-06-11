import { logger } from '@/lib/logger';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type ProductType = 'one_time' | 'recurring';

export interface Product {
  id: string;
  name: string;
  description: string | null;
  type: ProductType;
  price_cents: number;
  currency: string;
  is_active: boolean;
  sort_order: number;
  image_url: string | null;
  stripe_price_id: string | null;
  category_id: string | null;
  stock_quantity: number | null;
  track_inventory: boolean;
  low_stock_threshold: number;
  allow_backorder: boolean;
  available_in_pos?: boolean;
  barcode?: string | null;
  pos_category_id?: string | null;
  cost_cents?: number | null;
  created_at: string;
  updated_at: string;
}

export type StockStatus = 'in_stock' | 'low_stock' | 'out_of_stock' | 'untracked';

export function getStockStatus(product: Product): StockStatus {
  if (!product.track_inventory) return 'untracked';
  if (product.stock_quantity === null || product.stock_quantity === undefined) return 'untracked';
  if (product.stock_quantity <= 0) return 'out_of_stock';
  if (product.stock_quantity <= product.low_stock_threshold) return 'low_stock';
  return 'in_stock';
}

export function isProductPurchasable(product: Product): boolean {
  const status = getStockStatus(product);
  if (status === 'out_of_stock') return product.allow_backorder;
  return true;
}

export function useProducts(options?: { activeOnly?: boolean }) {
  return useQuery({
    queryKey: ['products', options],
    queryFn: async () => {
      let query = supabase
        .from('products')
        .select('*')
        .order('sort_order', { ascending: true });

      if (options?.activeOnly) {
        query = query.eq('is_active', true);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as Product[];
    },
  });
}

export function useProduct(id: string | undefined) {
  return useQuery({
    queryKey: ['product', id],
    queryFn: async () => {
      if (!id) return null;

      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      return data as Product;
    },
    enabled: !!id,
  });
}

export function useCreateProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (product: Omit<Product, 'id' | 'created_at' | 'updated_at' | 'category_id' | 'stock_quantity' | 'track_inventory' | 'low_stock_threshold' | 'allow_backorder'> & Partial<Pick<Product, 'category_id' | 'stock_quantity' | 'track_inventory' | 'low_stock_threshold' | 'allow_backorder'>>) => {
      const { data, error } = await supabase
        .from('products')
        .insert(product)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Product created');
    },
    onError: (error) => {
      logger.error('Create product error:', error);
      toast.error('Could not create product');
    },
  });
}

export function useUpdateProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Product> & { id: string }) => {
      const { data, error } = await supabase
        .from('products')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['product', data.id] });
      toast.success('Product updated');
    },
    onError: (error) => {
      logger.error('Update product error:', error);
      toast.error('Could not update product');
    },
  });
}

export function useDeleteProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Product deleted');
    },
    onError: (error) => {
      logger.error('Delete product error:', error);
      toast.error('Could not delete product');
    },
  });
}

export function formatPrice(cents: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}
