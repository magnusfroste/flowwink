/**
 * A product (or a product category) in language L — what every shop reader
 * shows. The Shopify rule, which is also the overlay rule with one difference
 * from blog posts: a product is never ABSENT in a language. A shop sells the
 * same products in every language; a product without a translation is shown
 * in its source language, unit by unit (Shopify: "untranslated content falls
 * back to the primary language").
 *
 *   the product's own language        → the product, as written
 *   a PUBLISHED overlay in L          → the product with the overlay's text;
 *                                       a unit the overlay lacks keeps the
 *                                       source text (visible, counted)
 *   neither                           → the product as written (source), noted
 *
 * One function for the shop, the product page, ProductsBlock, content-api and
 * browse_products, so "what is this product called in Swedish?" has one answer.
 *
 * Design: docs/architecture/page-translations.md §10.
 */
import { resolveContentInLocale, type OverlayRow } from './resolve-page.ts';
import type { PageLike, PostLike } from './translation-units.ts';

export type ProductEntity = 'product' | 'product_category' | 'product_attribute';

export interface ProductRowLike {
  id: string;
  name?: string | null;
  description?: string | null;
  locale?: string | null;
}

export interface ProductInLanguage<T> {
  /** The product with L's text in place — same keys, same shape. */
  product: T;
  /** The language the text is actually in: L, or the source language. */
  locale: string;
  source: 'product' | 'overlay' | 'fallback';
  /** The overlay's own slug in L (a category's address key), when it has one. */
  slug: string | null;
  coverage: number;
  fallback_units: string[];
  stale_units: string[];
}

function baseSubtag(tag: string | null | undefined): string {
  return String(tag ?? '').trim().toLowerCase().split('-')[0];
}

export function productInLanguage<T extends ProductRowLike>(
  product: T,
  lang: string | null | undefined,
  overlay: OverlayRow | null | undefined,
  defaultLanguage: string,
  entity: ProductEntity = 'product',
): ProductInLanguage<T> {
  const want = String(lang ?? '').trim().toLowerCase();
  const own = String(product.locale ?? defaultLanguage ?? '').trim().toLowerCase();
  if (!want || baseSubtag(own) === baseSubtag(want)) {
    return { product, locale: own || want, source: 'product', slug: null, coverage: 100, fallback_units: [], stale_units: [] };
  }
  if (!overlay || (overlay.status && overlay.status !== 'published')) {
    return { product, locale: own || defaultLanguage, source: 'fallback', slug: null, coverage: 0, fallback_units: [], stale_units: [] };
  }
  const r = resolveContentInLocale(entity, product as unknown as T & PageLike & PostLike, overlay);
  return {
    product: r.page as T,
    locale: overlay.locale,
    source: 'overlay',
    slug: r.slug ?? null,
    coverage: r.coverage,
    fallback_units: r.fallback_units,
    stale_units: r.stale_units,
  };
}

/** A list in L: every product kept (a shop sells everything in every language), each with L's text where it exists. Order kept. */
export function productsInLanguage<T extends ProductRowLike>(
  products: T[],
  lang: string | null | undefined,
  overlays: Array<OverlayRow & { entity_id: string }>,
  defaultLanguage: string,
  entity: ProductEntity = 'product',
): Array<ProductInLanguage<T>> {
  const want = String(lang ?? '').trim().toLowerCase();
  const byId = new Map<string, OverlayRow>();
  for (const o of overlays ?? []) {
    if (String(o.locale).toLowerCase() === want || (!byId.has(o.entity_id) && baseSubtag(o.locale) === baseSubtag(want))) {
      byId.set(o.entity_id, o);
    }
  }
  return (products ?? []).map((p) => productInLanguage(p, want, byId.get(p.id), defaultLanguage, entity));
}

/** A variant attribute as the storefront shows it: a heading and its values. */
export interface AttributeRowLike {
  id: string;
  name: string;
  locale?: string | null;
  values: Array<{ id: string; value: string }>;
}

/**
 * Variant labels in L (§10): an attribute's name and values from its published
 * overlay (units attribute.name, attribute.value.<id>), the source text where
 * a unit is missing. Attributes are site-wide, so the same overlay serves
 * every product with that option. Returns copies in the same order.
 */
export function attributesInLanguage<T extends AttributeRowLike>(
  attributes: T[],
  lang: string | null | undefined,
  overlays: Array<OverlayRow & { entity_id: string }>,
  defaultLanguage: string,
): T[] {
  const want = String(lang ?? '').trim().toLowerCase();
  if (!want) return attributes;
  const byId = new Map<string, OverlayRow>();
  for (const o of overlays ?? []) {
    if (o.status && o.status !== 'published') continue;
    if (String(o.locale).toLowerCase() === want || (!byId.has(o.entity_id) && baseSubtag(o.locale) === baseSubtag(want))) byId.set(o.entity_id, o);
  }
  return attributes.map((a) => {
    const own = String(a.locale ?? defaultLanguage ?? '').trim().toLowerCase();
    const o = byId.get(a.id);
    if (baseSubtag(own) === baseSubtag(want) || !o?.strings) return a;
    const text = (unit: string) => {
      const t = (o.strings as Record<string, { text?: string }>)[unit]?.text;
      return typeof t === 'string' && t.trim() ? t : null;
    };
    return {
      ...a,
      name: text('attribute.name') ?? a.name,
      values: a.values.map((v) => ({ ...v, value: text(`attribute.value.${v.id}`) ?? v.value })),
    };
  });
}
