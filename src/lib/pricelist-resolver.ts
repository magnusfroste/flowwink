/**
 * Pricelist resolver — applies versioned/customer-specific pricing to line items
 * before they are persisted to invoices / quotes / orders.
 *
 * Sprint 3 hook: any line item that carries a `product_id` is run through
 * `resolve_pricelist_price` so the customer automatically gets the best
 * matching price (volume / contract / global) without manual lookup.
 *
 * Behaviour:
 *  - Line items WITHOUT product_id pass through unchanged (free-text rows).
 *  - Line items WITH `unit_price_locked: true` pass through unchanged
 *    (manual override — sales rep set a custom price intentionally).
 *  - Otherwise we ask the RPC for the best price; on success we overwrite
 *    `unit_price_cents` and tag the row with `pricelist_id` / `price_source`
 *    for audit + UI display.
 */

import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import type { InvoiceLineItem } from '@/hooks/useInvoices';

export interface PricedLineItem extends InvoiceLineItem {
  product_id?: string | null;
  unit_price_locked?: boolean;
  pricelist_id?: string | null;
  price_source?: 'pricelist' | 'product_base' | 'manual' | null;
}

export interface PricelistContext {
  lead_id?: string | null;
  company_id?: string | null;
  currency?: string;
}

export async function applyPricelistToLineItems(
  items: PricedLineItem[],
  ctx: PricelistContext
): Promise<PricedLineItem[]> {
  if (!items?.length) return items;

  const out: PricedLineItem[] = [];
  for (const item of items) {
    if (!item.product_id || item.unit_price_locked) {
      out.push({ ...item, price_source: item.unit_price_locked ? 'manual' : item.price_source ?? null });
      continue;
    }

    try {
      const { data, error } = await supabase.rpc('resolve_pricelist_price', {
        p_product_id: item.product_id,
        p_lead_id: ctx.lead_id ?? null,
        p_company_id: ctx.company_id ?? null,
        p_quantity: item.qty || 1,
        p_currency: ctx.currency || 'SEK',
      });

      if (error) {
        logger.warn('[pricelist] resolve failed, keeping unit_price', error.message);
        out.push(item);
        continue;
      }

      const row = Array.isArray(data) ? data[0] : data;
      if (row && typeof row.price_cents === 'number') {
        out.push({
          ...item,
          unit_price_cents: row.price_cents,
          pricelist_id: row.pricelist_id ?? null,
          price_source: (row.source as PricedLineItem['price_source']) ?? 'product_base',
        });
      } else {
        out.push(item);
      }
    } catch (e) {
      logger.warn('[pricelist] unexpected error, keeping unit_price', e);
      out.push(item);
    }
  }
  return out;
}
