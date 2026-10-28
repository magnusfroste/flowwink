import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { productPath } from '@/lib/language-path';
import { productsInLanguage, type ProductEntity, type ProductRowLike } from '../../supabase/functions/_shared/i18n/product-language';
import type { OverlayRow } from '../../supabase/functions/_shared/i18n/resolve-page';
import type { OverlayEntry } from '../../supabase/functions/_shared/i18n/translation-units';
import { isMissingSchema } from '@/lib/blog-language';

/**
 * Products (and categories) in a language, for the public readers
 * (page-translations.md §10). The rule — own language, published overlay, or
 * the source text as a fallback — is `productInLanguage` in _shared, shared
 * with content-api and the product skills. A product is never dropped from a
 * language: a shop sells the same products everywhere (the Shopify rule).
 */

export type ProductOverlayRow = OverlayRow & { entity_id: string };

/** Published overlays of these rows in `lang` (RLS limits them to active products). */
export async function loadProductOverlays(entity: ProductEntity, ids: string[], lang: string | null): Promise<ProductOverlayRow[]> {
  if (!ids.length || !lang) return [];
  const { data, error } = await supabase
    .from('content_translations')
    .select('entity_id, locale, status, slug, strings')
    .eq('entity', entity)
    .eq('status', 'published')
    .eq('locale', lang)
    .in('entity_id', ids);
  if (error) {
    if (!isMissingSchema(error)) logger.error(`[${entity}] overlay read failed:`, error);
    return [];
  }
  return (data ?? []).map((r) => ({
    entity_id: r.entity_id, locale: r.locale, status: r.status, slug: r.slug,
    strings: (r.strings ?? null) as unknown as Record<string, OverlayEntry> | null,
  }));
}

/** Rows with `lang`'s text where it exists; every row kept, in order. */
export function localizeProducts<T extends ProductRowLike>(
  rows: T[],
  lang: string | null,
  overlays: ProductOverlayRow[],
  defaultLanguage: string,
  entity: ProductEntity = 'product',
): Array<T & { served_locale?: string; href?: string; fallback_units?: string[]; source_slug?: string }> {
  if (!lang) return rows;
  return productsInLanguage(rows, lang, overlays, defaultLanguage, entity).map((r) => ({
    ...r.product,
    served_locale: r.locale,
    ...(entity === 'product' ? { href: productPath(r.product.id, lang, defaultLanguage) } : {}),
    // A category's slug in L is its overlay's (translated) slug; the source slug
    // stays as source_slug so an old link still resolves (§10).
    ...(entity === 'product_category' && 'slug' in (r.product as object)
      ? { slug: r.slug ?? (r.product as unknown as { slug: string }).slug, source_slug: (r.product as unknown as { slug: string }).slug }
      : {}),
    ...(r.fallback_units.length ? { fallback_units: r.fallback_units } : {}),
  }));
}

/** One list in `lang`, overlays loaded and applied. The caller decides `lang` (null = as written). */
export async function productsInLang<T extends ProductRowLike>(rows: T[], lang: string | null, defaultLanguage: string, entity: ProductEntity = 'product') {
  const overlays = await loadProductOverlays(entity, rows.map((r) => r.id), lang);
  return localizeProducts(rows, lang, overlays, defaultLanguage, entity);
}
