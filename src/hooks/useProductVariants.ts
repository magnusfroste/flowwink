import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Public storefront hook for product variants (EPIC-01 tables).
 *
 * Reads go straight through the anon supabase client — product_variants,
 * product_variant_values, product_attribute_values and product_attributes all
 * have public SELECT RLS policies (active variants only), so this is safe for
 * anonymous visitors. No edge function involved.
 */

export interface VariantAttributeValue {
  id: string;
  value: string;
  sortOrder: number;
}

export interface VariantAttribute {
  id: string;
  name: string;
  displayType: string;
  sortOrder: number;
  values: VariantAttributeValue[];
}

export interface PublicVariant {
  id: string;
  sku: string | null;
  priceDeltaCents: number;
  stockQuantity: number | null;
  imageUrl: string | null;
  /** Attribute value ids composing this variant. */
  valueIds: string[];
  /** Human label, e.g. "Red / M" (attribute sort order). */
  label: string;
}

export interface ProductVariantData {
  variants: PublicVariant[];
  attributes: VariantAttribute[];
}

interface RawVariantRow {
  id: string;
  sku: string | null;
  price_delta_cents: number;
  stock_quantity: number | null;
  image_url: string | null;
  product_variant_values: {
    product_attribute_values: {
      id: string;
      value: string;
      sort_order: number;
      product_attributes: {
        id: string;
        name: string;
        display_type: string;
        sort_order: number;
      } | null;
    } | null;
  }[];
}

export function useProductVariants(productId: string | undefined) {
  return useQuery({
    queryKey: ['product-variants', productId],
    queryFn: async (): Promise<ProductVariantData> => {
      const { data, error } = await supabase
        .from('product_variants')
        .select(
          `id, sku, price_delta_cents, stock_quantity, image_url,
           product_variant_values (
             product_attribute_values (
               id, value, sort_order,
               product_attributes ( id, name, display_type, sort_order )
             )
           )`
        )
        .eq('product_id', productId!)
        .eq('is_active', true)
        .order('created_at', { ascending: true });

      if (error) throw error;

      const rows = (data ?? []) as unknown as RawVariantRow[];
      const attributeMap = new Map<string, VariantAttribute>();
      const variants: PublicVariant[] = [];

      for (const row of rows) {
        const parts: { attrSort: number; attrName: string; value: string }[] = [];
        const valueIds: string[] = [];

        for (const vv of row.product_variant_values ?? []) {
          const av = vv.product_attribute_values;
          const attr = av?.product_attributes;
          if (!av || !attr) continue;

          valueIds.push(av.id);
          parts.push({ attrSort: attr.sort_order, attrName: attr.name, value: av.value });

          let entry = attributeMap.get(attr.id);
          if (!entry) {
            entry = {
              id: attr.id,
              name: attr.name,
              displayType: attr.display_type,
              sortOrder: attr.sort_order,
              values: [],
            };
            attributeMap.set(attr.id, entry);
          }
          if (!entry.values.some(v => v.id === av.id)) {
            entry.values.push({ id: av.id, value: av.value, sortOrder: av.sort_order });
          }
        }

        parts.sort((a, b) => a.attrSort - b.attrSort || a.attrName.localeCompare(b.attrName));
        variants.push({
          id: row.id,
          sku: row.sku,
          priceDeltaCents: row.price_delta_cents ?? 0,
          stockQuantity: row.stock_quantity,
          imageUrl: row.image_url,
          valueIds,
          label: parts.map(p => p.value).join(' / '),
        });
      }

      const attributes = [...attributeMap.values()]
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
      for (const attr of attributes) {
        attr.values.sort((a, b) => a.sortOrder - b.sortOrder || a.value.localeCompare(b.value));
      }

      return { variants, attributes };
    },
    enabled: !!productId,
  });
}

/**
 * Which products have active variants? Used by listing surfaces (ShopPage,
 * ProductsBlock, FeaturedProductBlock) to send visitors to the product page
 * to pick options instead of adding a variant-less line to the cart.
 */
export function useVariantProductIds() {
  return useQuery({
    queryKey: ['variant-product-ids'],
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await supabase
        .from('product_variants')
        .select('product_id')
        .eq('is_active', true);

      if (error) throw error;
      return new Set((data ?? []).map(r => r.product_id as string));
    },
    staleTime: 60_000,
  });
}

/** Resolve the selected attribute-value combination to a single variant. */
export function resolveVariant(
  variants: PublicVariant[],
  attributes: VariantAttribute[],
  selection: Record<string, string>
): PublicVariant | null {
  if (attributes.length === 0) return null;
  const selectedIds = attributes.map(a => selection[a.id]).filter(Boolean);
  if (selectedIds.length !== attributes.length) return null;
  return (
    variants.find(
      v =>
        v.valueIds.length === selectedIds.length &&
        selectedIds.every(id => v.valueIds.includes(id))
    ) ?? null
  );
}
