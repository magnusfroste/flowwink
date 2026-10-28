import { logger } from '@/lib/logger';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { productsInLang } from '@/lib/product-language';

export type ProductType = 'one_time' | 'recurring';

export interface Product {
  id: string;
  name: string;
  description: string | null;
  type: ProductType;
  price_cents: number;
  /** For a recurring product: the billing cadence its price is quoted in.
   *  'month' | 'year'. NULL/undefined for one_time. The one atomic fact that
   *  lets the price travel the sales chain with its dimension — see
   *  docs/architecture/recurring-value-model.md. */
  billing_interval?: 'month' | 'year' | null;
  /** Optional suggested binding term (months) for a recurring product. */
  default_term_months?: number | null;
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
  /** Weight in grams. null = non-shippable (service/digital) — the product
   *  does not participate in the checkout shipping calculation. */
  weight_grams?: number | null;
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

/**
 * Reader options. `language` is the language the list is shown in — null (the
 * default) is the product as written. With a language, name and description
 * come from the product's published overlay in content_translations where it
 * has one and from the source text where it does not (page-translations.md
 * §10): the same products in every language, never a hole.
 */
export interface ProductReadOptions {
  activeOnly?: boolean;
  language?: string | null;
  defaultLanguage?: string;
}

/** A product as served in a language: `served_locale` says which one the text is in. */
export type LocalizedProduct = Product & { served_locale?: string; href?: string; fallback_units?: string[] };

export function useProducts(options?: ProductReadOptions) {
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
      const rows = data as Product[];
      if (!options?.language) return rows as LocalizedProduct[];
      return (await productsInLang(rows, options.language, options.defaultLanguage ?? options.language)) as LocalizedProduct[];
    },
  });
}

export function useProduct(id: string | undefined, options?: Pick<ProductReadOptions, 'language' | 'defaultLanguage'>) {
  return useQuery({
    queryKey: ['product', id, options?.language ?? null],
    queryFn: async () => {
      if (!id) return null;

      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      if (!options?.language) return data as LocalizedProduct;
      const [row] = await productsInLang([data as Product], options.language, options.defaultLanguage ?? options.language);
      return (row ?? data) as LocalizedProduct;
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
      // RLS-denied deletes return success with 0 rows — count them, or the
      // toast claims a deletion the database refused to perform.
      const { data, error } = await supabase
        .from('products')
        .delete()
        .eq('id', id)
        .select('id');

      if (error) throw error;
      if (!data?.length) throw new Error('Nothing was deleted — you may not have permission, or it is already gone.');
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
