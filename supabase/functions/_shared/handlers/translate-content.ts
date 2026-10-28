/**
 * translate_content — translate_page's engine for any overlaid content.
 *
 * `entity: 'blog_post'` translates a post's missing and stale units (title,
 * excerpt, meta, the body as one document, the image's alt text) into an
 * overlay per language; `entity: 'page'` is translate_page. One call per
 * (content, language) is what keeps a long post inside the wall clock; the
 * `languages` form loops over several for the common case of a short post.
 *
 * Also the rail behind write_blog_post's `languages` and manage_blog_posts
 * update's re-translation (`translatePostEverywhere`).
 *
 * Design: docs/architecture/page-translations.md §9.
 */
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { isContentEntity, isMissingRelation, listContentOverlays, loadContentSource, translateContentIntoOverlay } from './content-overlay.ts';
import type { ContentEntity } from '../i18n/translation-units.ts';

const NOUN: Record<ContentEntity, string> = { page: 'page', blog_post: 'post', product: 'product', product_category: 'category', product_attribute: 'attribute' };

/** The entity a caller named, with the aliases people type. */
export function contentEntityOf(raw: unknown): ContentEntity | null {
  const e = String(raw ?? '').trim().toLowerCase().replace(/-/g, '_');
  const norm = e === 'post' || e === 'blog' ? 'blog_post'
    : e === 'products' ? 'product'
    : e === 'category' || e === 'categories' || e === 'product_categories' ? 'product_category'
    : e === 'attribute' || e === 'attributes' || e === 'product_attributes' || e === 'variant' || e === 'variant_label' || e === 'variant_labels' ? 'product_attribute'
    : e;
  return isContentEntity(norm) ? norm : null;
}
import { normalizeLocale, siteLanguages } from './page-translations.ts';
import { handleTranslatePage } from './translate-page.ts';

export interface TranslateContentArgs {
  /** 'blog_post', 'page', 'product' or 'product_category'. */
  entity?: string;
  slug?: string;
  id?: string;
  post_id?: string;
  page_id?: string;
  product_id?: string;
  category_id?: string;
  /** The variant attribute (entity "product_attribute") — its name and values are the variant labels. */
  attribute_id?: string;
  /** The language to translate into. */
  locale?: string;
  /** Several at once; 'all' = every enabled language but the source's. */
  languages?: string[] | 'all';
  publish?: boolean;
  dry_run?: boolean;
  force?: boolean;
  context?: string;
}

export async function handleTranslateContent(supabase: SupabaseClient, args: TranslateContentArgs): Promise<Record<string, unknown>> {
  const entity = contentEntityOf(args.entity);
  if (entity === 'page') {
    return await handleTranslatePage(supabase, {
      slug: args.slug, page_id: args.page_id ?? args.id, locale: args.locale,
      publish: args.publish, dry_run: args.dry_run, force: args.force, context: args.context,
    });
  }
  if (!entity) return { success: false, error: 'entity is required: "blog_post", "product", "product_category" or "product_attribute" (or "page" — the same as translate_page).' };
  const noun = NOUN[entity];

  const id = args.post_id ?? args.product_id ?? args.category_id ?? args.attribute_id ?? args.id;
  if (!args.slug && !id) return { success: false, error: `Give ${entity === 'product' ? 'product_id (or the exact product name as slug)' : entity === 'product_attribute' ? 'attribute_id (or the attribute name as slug)' : `slug or ${noun}_id`} of the source ${noun}.` };
  const src = await loadContentSource(supabase, entity, id ? { id: String(id) } : { slug: String(args.slug) });
  if (!src) return { success: false, error: `No ${noun} "${args.slug ?? id}".` };

  const langs = await siteLanguages(supabase);
  const own = String(src.locale ?? langs.default).toLowerCase();
  let targets: string[];
  if (args.locale) {
    const l = normalizeLocale(args.locale);
    if (!l) return { success: false, error: `Not a language tag: "${args.locale}". Use "sv", "de", "en-GB".` };
    targets = [l];
  } else if (args.languages === 'all' || (Array.isArray(args.languages) && args.languages.length)) {
    targets = args.languages === 'all' ? langs.enabled : (args.languages as string[]).map(normalizeLocale).filter((x): x is string => !!x);
  } else {
    return { success: false, error: 'locale is required (or languages: ["sv", …] / "all").' };
  }
  targets = [...new Set(targets)].filter((l) => l !== own);
  if (!targets.length) return { success: false, error: `"${src.slug}" is written in ${own} — give a language to translate INTO.` };

  const results: Array<Record<string, unknown>> = [];
  for (const l of targets) {
    results.push(await translateContentIntoOverlay(supabase, src, l, {
      publish: args.publish, dry_run: args.dry_run, force: args.force, context: args.context, source: 'translate_content',
    }, { source_locale: own }));
  }
  // A product's translation carries its variant labels (§10): the attributes
  // its active variants use, into the same languages.
  const variantLabels = entity === 'product' && !args.dry_run
    ? await translateProductAttributes(supabase, src.id, { languages: targets, publish: args.publish, force: args.force, context: args.context })
    : [];
  const labelsPart = variantLabels.length ? { variant_labels: variantLabels } : {};
  if (results.length === 1) return { ...results[0], ...labelsPart };
  const failed = results.filter((r) => !r.success);
  return {
    success: failed.length === 0, entity, slug: src.slug, source_locale: own,
    languages: targets, results, ...labelsPart,
    ...(failed.length ? { error: `${failed.length} language(s) failed — see results.` } : {}),
  };
}

/** The attributes a product's active variants use — the labels a visitor sees on its page. */
async function productAttributeIds(supabase: SupabaseClient, productId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('product_variants')
    .select('product_variant_values(product_attribute_values(attribute_id))')
    .eq('product_id', productId)
    .eq('is_active', true);
  if (error) {
    if (isMissingRelation(error)) return [];
    throw new Error(`product_variants read failed: ${error.message}`);
  }
  const ids = new Set<string>();
  type Row = { product_variant_values?: Array<{ product_attribute_values?: { attribute_id?: string } | null }> | null };
  for (const v of (data ?? []) as unknown as Row[]) {
    for (const vv of v.product_variant_values ?? []) {
      const a = vv.product_attribute_values?.attribute_id;
      if (a) ids.add(String(a));
    }
  }
  return [...ids];
}

/**
 * The variant labels of one product, in the languages asked for: every
 * attribute its active variants use, as product_attribute overlays. Attributes
 * are site-wide, so a label translated here follows every product with that
 * option. `languages: []` touches only the overlays that already exist.
 */
export async function translateProductAttributes(
  supabase: SupabaseClient,
  productId: string,
  opts: { languages: string[] | 'all'; publish?: boolean; force?: boolean; context?: string },
): Promise<Array<Record<string, unknown>>> {
  const out: Array<Record<string, unknown>> = [];
  for (const id of await productAttributeIds(supabase, productId)) {
    try {
      const r = await translateEntityEverywhere(supabase, 'product_attribute', id, opts);
      out.push({ attribute_id: id, translations: r.translations, ...(r.skipped ? { skipped: r.skipped } : {}) });
    } catch (err) {
      out.push({ attribute_id: id, translations: [], error: (err as Error).message });
    }
  }
  return out;
}

/**
 * After a post is written or edited: bring every overlay up to date. With
 * `languages`, those languages are created as well; without, only the
 * overlays that already exist are touched. Only missing and stale units are
 * translated — a hand-polished sentence survives an edit elsewhere in the post.
 * An overlay is published when it is complete and `publish` says so; the
 * post's own status still decides whether a visitor sees any of it.
 */
export async function translatePostEverywhere(
  supabase: SupabaseClient,
  postId: string,
  opts: { languages?: string[]; publish?: boolean; context?: string } = {},
): Promise<{ translations: Array<Record<string, unknown>>; skipped?: string }> {
  return await translateEntityEverywhere(supabase, 'blog_post', postId, opts);
}

/**
 * The same rail for any overlaid entity: a product's name and description
 * after manage_product create (`languages`) or update (the overlays that
 * exist). `languages: 'all'` is every enabled language but the source's.
 */
export async function translateEntityEverywhere(
  supabase: SupabaseClient,
  entity: ContentEntity,
  entityId: string,
  opts: { languages?: string[] | 'all'; publish?: boolean; force?: boolean; context?: string } = {},
): Promise<{ translations: Array<Record<string, unknown>>; variant_labels?: Array<Record<string, unknown>>; skipped?: string }> {
  const src = await loadContentSource(supabase, entity, { id: entityId });
  if (!src) return { translations: [], skipped: `${NOUN[entity]} not found` };
  const langs = await siteLanguages(supabase);
  const own = String(src.locale ?? langs.default).toLowerCase();
  const { rows, table } = await listContentOverlays(supabase, entity, { ids: [entityId], columns: 'entity_id, locale, status' });
  const requested = opts.languages === 'all' ? langs.enabled : (opts.languages ?? []);
  opts = { ...opts, languages: requested };
  const postId = entityId;
  if (!table) return { translations: [], skipped: 'content_translations does not exist on this instance yet' };
  const existing = new Map(rows.map((r) => [r.locale, r.status]));
  const wanted = new Set<string>([
    ...(opts.languages ?? []).map(normalizeLocale).filter((x): x is string => !!x),
    ...existing.keys(),
  ]);
  wanted.delete(own);
  const translations: Array<Record<string, unknown>> = [];
  for (const l of wanted) {
    try {
      const r = await translateContentIntoOverlay(supabase, src, l, {
        publish: opts.publish ?? existing.get(l) === 'published', force: opts.force, context: opts.context, source: 'translate_content',
      });
      translations.push({
        locale: l, success: r.success, status: r.status ?? null, coverage: r.coverage ?? null,
        units_translated: r.units_translated ?? 0, units_kept: r.units_kept ?? 0,
        ...(r.error ? { error: r.error } : {}), ...(r.note ? { note: r.note } : {}),
      });
    } catch (err) {
      translations.push({ locale: l, success: false, error: (err as Error).message });
    }
  }
  // A product's labels follow it: into the languages asked for, else only the
  // attribute overlays that already exist (their stale units).
  if (entity === 'product') {
    const variantLabels = await translateProductAttributes(supabase, entityId, { languages: requested, publish: opts.publish, force: opts.force, context: opts.context });
    return { translations, ...(variantLabels.length ? { variant_labels: variantLabels } : {}) };
  }
  return { translations };
}
