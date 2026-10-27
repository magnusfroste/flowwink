/**
 * The overlay store — content_translations, for every kind of content.
 *
 * A page and a blog post are the same thing to the overlay: a source row in
 * its own language, and per other language a row of strings keyed per unit.
 * This module is the one place that reads and writes that row, and the one
 * engine that translates into it (`translateContentIntoOverlay`). The
 * page-shaped skills (translate_page, set_translation, publish_translation)
 * and the generic one (translate_content) all go through it.
 *
 * Design: docs/architecture/page-translations.md §2.2, §9.
 */
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { batchStrings, structureSignature } from '../i18n/translate-walk.ts';
import { translateAll } from '../i18n/translate.ts';
import { slugify } from '../slugify.ts';
import { collectEntityUnits, type ContentEntity, type OverlayEntry, type TranslationUnit } from '../i18n/translation-units.ts';
import { assembleOverlay, numberForTranslation, planOverlayWrite } from '../i18n/overlay-write.ts';

const MAX_BATCHES = 24;
const TABLE = 'content_translations';
const COLUMNS = 'entity, entity_id, locale, status, slug, strings, coverage, translated_at, translated_by';

export interface ContentOverlayRow {
  entity: ContentEntity;
  entity_id: string;
  locale: string;
  status: string;
  slug: string | null;
  strings: Record<string, OverlayEntry> | null;
  coverage: number | null;
  translated_at: string | null;
  translated_by: string | null;
}

/** The source of an overlay: one row of pages or blog_posts, with its units. */
export interface ContentSource {
  entity: ContentEntity;
  id: string;
  slug: string;
  title: string;
  status: string;
  locale: string | null;
  units: TranslationUnit[];
}

const SOURCE_TABLE: Record<ContentEntity, string> = { page: 'pages', blog_post: 'blog_posts', product: 'products', product_category: 'product_categories', product_attribute: 'product_attributes' };
const SOURCE_COLUMNS: Record<ContentEntity, string> = {
  page: 'id, slug, title, status, locale, content_json, meta_json',
  blog_post: 'id, slug, title, status, locale, excerpt, content_json, meta_json, featured_image_alt',
  // A product has no slug: its id is its address; its name is what a caller
  // may hold instead of the id. is_active plays status (an archived product
  // is 'draft' to the publish rule and to the public-read policy).
  product: 'id, name, description, is_active, locale',
  product_category: 'id, slug, name, description, is_active, locale',
  // A variant attribute with its values — one source row, units attribute.name and attribute.value.<id>.
  product_attribute: 'id, name, locale, product_attribute_values(id, value, sort_order)',
};

export function isContentEntity(v: unknown): v is ContentEntity {
  return v === 'page' || v === 'blog_post' || v === 'product' || v === 'product_category' || v === 'product_attribute';
}

/** A missing table/column reads as "no overlay store yet" (an instance behind on migrations). */
export function isMissingRelation(err: { code?: unknown } | null | undefined): boolean {
  return !!err && ['42P01', '42703', 'PGRST205'].includes(String(err.code));
}

/** The source row of an entity, by id or slug, with its units. Pages in the trash are not sources. */
export async function loadContentSource(
  supabase: SupabaseClient,
  entity: ContentEntity,
  where: { id?: string; slug?: string },
): Promise<ContentSource | null> {
  let q = supabase.from(SOURCE_TABLE[entity]).select(SOURCE_COLUMNS[entity]);
  if (entity === 'page') q = q.is('deleted_at', null);
  const key = String(where.slug ?? '').trim();
  let row: Record<string, unknown> | null = null;
  if (!where.id && entity === 'product') {
    // No slug on a product — its name stands in, and a name is not unique: two hits is an error, not a guess.
    const { data, error } = await q.eq('name', key).limit(2);
    if (error) throw new Error(`${SOURCE_TABLE[entity]} read failed: ${error.message}`);
    const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
    if (rows.length > 1) throw new Error(`${SOURCE_TABLE[entity]}: "${key}" matches more than one product — give product_id.`);
    row = rows[0] ?? null;
  } else {
    // An attribute has no slug either, but its name is unique — it stands in.
    q = where.id ? q.eq('id', where.id) : entity === 'product_attribute' ? q.eq('name', key) : q.eq('slug', key);
    const { data, error } = await q.maybeSingle();
    if (error) throw new Error(`${SOURCE_TABLE[entity]} read failed: ${error.message}`);
    row = (data as unknown as Record<string, unknown> | null) ?? null;
  }
  if (!row) return null;
  if (Array.isArray(row.product_attribute_values)) {
    // Values in their shown order, so the unit paths are stable between reads.
    row.product_attribute_values = [...(row.product_attribute_values as Array<{ sort_order?: number; value?: string }>)]
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || String(a.value ?? '').localeCompare(String(b.value ?? '')));
  }
  return {
    entity,
    id: String(row.id),
    slug: String(row.slug ?? row.id ?? ''),
    title: String(row.title ?? row.name ?? ''),
    status: String(row.status ?? (row.is_active === false ? 'draft' : row.is_active === true ? 'published' : '')),
    locale: typeof row.locale === 'string' && row.locale ? row.locale.toLowerCase() : null,
    units: collectEntityUnits(entity, row),
  };
}

export async function loadContentOverlay(supabase: SupabaseClient, entity: ContentEntity, id: string, locale: string): Promise<ContentOverlayRow | null> {
  const { data, error } = await supabase.from(TABLE).select(COLUMNS)
    .eq('entity', entity).eq('entity_id', id).eq('locale', locale).maybeSingle();
  if (error) {
    if (isMissingRelation(error)) throw new Error('content_translations does not exist on this instance — apply migration 20261025030000 first.');
    throw new Error(`overlay read failed: ${error.message}`);
  }
  return (data as ContentOverlayRow | null) ?? null;
}

/**
 * The slug a category's translated name would take in `locale`, or null when
 * the name is not translated yet, the slug is a category's source slug, or
 * another category's overlay already carries it in that language.
 */
async function freeCategorySlug(
  supabase: SupabaseClient,
  src: ContentSource,
  locale: string,
  strings: Record<string, OverlayEntry>,
): Promise<string | null> {
  if (src.entity !== 'product_category') return null;
  const name = strings['category.name']?.text;
  const slug = typeof name === 'string' ? slugify(name, { maxLength: 80 }) : '';
  if (!slug || slug === src.slug) return null;
  const { data: own, error: ownErr } = await supabase.from('product_categories').select('id').eq('slug', slug).neq('id', src.id).limit(1);
  if (ownErr) throw new Error(`product_categories read failed: ${ownErr.message}`);
  if (own?.length) return null;
  const { data: taken, error: takenErr } = await supabase.from(TABLE).select('entity_id').eq('entity', 'product_category').eq('locale', locale).eq('slug', slug).neq('entity_id', src.id).limit(1);
  if (takenErr) throw new Error(`overlay slug check failed: ${takenErr.message}`);
  if (taken?.length) return null;
  return slug;
}

/** Every overlay of one entity kind, optionally in one language. */
export async function listContentOverlays(
  supabase: SupabaseClient,
  entity: ContentEntity,
  opts: { locale?: string; ids?: string[]; columns?: string } = {},
): Promise<{ rows: ContentOverlayRow[]; table: boolean }> {
  let q = supabase.from(TABLE).select(opts.columns ?? COLUMNS).eq('entity', entity);
  if (opts.locale) q = q.eq('locale', opts.locale);
  if (opts.ids) q = q.in('entity_id', opts.ids.length ? opts.ids : ['00000000-0000-0000-0000-000000000000']);
  const { data, error } = await q;
  if (error) {
    if (isMissingRelation(error)) return { rows: [], table: false };
    throw new Error(`overlay read failed: ${error.message}`);
  }
  return { rows: (data ?? []) as unknown as ContentOverlayRow[], table: true };
}

export async function upsertContentOverlay(
  supabase: SupabaseClient,
  row: { entity: ContentEntity; entity_id: string; locale: string } & Partial<Omit<ContentOverlayRow, 'entity' | 'entity_id' | 'locale'>>,
): Promise<{ status: string; coverage: number | null } | null> {
  const { data, error } = await supabase.from(TABLE)
    .upsert(row, { onConflict: 'entity,entity_id,locale' }).select('status, coverage').maybeSingle();
  if (error) throw new Error(`overlay write failed: ${error.message}`);
  return (data as { status: string; coverage: number | null } | null) ?? null;
}

export async function updateContentOverlay(
  supabase: SupabaseClient,
  entity: ContentEntity,
  id: string,
  locale: string,
  patch: Record<string, unknown>,
): Promise<{ status: string; coverage: number | null; slug: string | null } | null> {
  const { data, error } = await supabase.from(TABLE).update(patch)
    .eq('entity', entity).eq('entity_id', id).eq('locale', locale).select('status, coverage, slug').maybeSingle();
  if (error) throw new Error(`overlay update failed: ${error.message}`);
  return (data as { status: string; coverage: number | null; slug: string | null } | null) ?? null;
}

export interface TranslateIntoOverlayArgs {
  publish?: boolean;
  dry_run?: boolean;
  force?: boolean;
  context?: string;
  source?: string;
}

/**
 * The engine: translate the source's missing and stale units into `locale`
 * and upsert the overlay. Fresh entries are never rewritten; a doc unit is
 * translated node by node and stored whole, refused when its structure would
 * change.
 */
export async function translateContentIntoOverlay(
  supabase: SupabaseClient,
  src: ContentSource,
  locale: string,
  args: TranslateIntoOverlayArgs,
  extra: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const from = String(src.locale ?? '').toLowerCase() || 'auto';
  const existing = await loadContentOverlay(supabase, src.entity, src.id, locale);
  const strings = (existing?.strings ?? null) as Record<string, OverlayEntry> | null;
  const plan = planOverlayWrite(src.units, strings, { force: !!args.force });
  const numbering = numberForTranslation(plan.translate);
  const batches = batchStrings(numbering.items);

  const base = {
    entity: src.entity, slug: src.slug, locale, from, mode: 'overlay', ...extra,
    units_total: plan.total, units_missing: plan.missing.length, units_stale: plan.stale.length,
    units_kept: Object.keys(plan.keep).length, orphans: plan.orphans.length,
    overlay_status: existing?.status ?? null,
  };

  if (args.dry_run) {
    return {
      success: true, dry_run: true, ...base,
      ...(plan.stale.length ? { stale: plan.stale } : {}),
      strings_to_translate: numbering.items.length, batches: batches.length,
      sample: numbering.items.slice(0, 8).map((it) => it.text.slice(0, 80)),
      note: 'Nothing was translated or written. Call again without dry_run to translate.',
    };
  }

  let translations = new Map<number, string>();
  let untranslatedIdx: number[] = [];
  let truncated = false;
  const sourceLabel = args.source ?? 'translate_content';
  if (numbering.items.length) {
    truncated = batches.length > MAX_BATCHES;
    const run = truncated ? batches.slice(0, MAX_BATCHES) : batches;
    const res = await translateAll(supabase, numbering.items, { to: locale, from, context: args.context, source: sourceLabel }, run);
    translations = res.translations;
    untranslatedIdx = res.untranslated;
  }
  const out = assembleOverlay(plan, numbering, translations, strings);

  // Structure guard on every doc we are about to store.
  for (const unit of plan.translate) {
    if (unit.kind !== 'doc') continue;
    const stored = out.strings[unit.unit]?.doc as { content?: unknown } | undefined;
    if (stored && structureSignature(stored.content) !== structureSignature((unit.doc as { content?: unknown }).content)) {
      return { success: false, error: `Structure of ${unit.unit} changed during translation — nothing was written.`, ...base };
    }
  }

  const complete = out.untranslated.length === 0 && !truncated;
  const status = args.publish && complete ? 'published' : (existing?.status ?? 'draft');
  // A category's address key per language (§10): the first translation of its
  // name gives the overlay a slug, when that slug is free in the language. A
  // slug set by hand (publish_translation translated_slug) is never replaced.
  const derivedSlug = existing?.slug ? null : await freeCategorySlug(supabase, src, locale, out.strings);
  let written: { status: string; coverage: number | null } | null;
  try {
    written = await upsertContentOverlay(supabase, {
      entity: src.entity, entity_id: src.id, locale, status, strings: out.strings, coverage: out.coverage,
      translated_at: new Date().toISOString(), translated_by: sourceLabel,
      ...(existing?.slug ? { slug: existing.slug } : derivedSlug ? { slug: derivedSlug } : {}),
    });
  } catch (err) {
    return { success: false, error: (err as Error).message, ...base };
  }

  const left = out.untranslated.length + (truncated ? numbering.items.length - batches.slice(0, MAX_BATCHES).flat().length : 0);
  const finalStatus = written?.status ?? status;
  return {
    success: true, ...base,
    strings_sent: numbering.items.length, strings_untranslated: untranslatedIdx.length,
    units_translated: out.translated.length, units_untranslated: out.untranslated.length,
    coverage: written?.coverage ?? out.coverage,
    status: finalStatus, published: finalStatus === 'published',
    batches: Math.min(batches.length, MAX_BATCHES),
    ...(truncated ? { note: `Large ${src.entity === 'page' ? 'page' : 'post'}: ${MAX_BATCHES} of ${batches.length} batches done. Call again to continue; translated units are kept.` } : {}),
    ...(left && !truncated ? { note: `${out.untranslated.length} unit(s) came back untranslated — call again, or set them with set_translation.` } : {}),
    ...(args.publish && finalStatus !== 'published' ? { note: 'Not published: translate the remaining units first, then publish_translation.' } : {}),
  };
}
