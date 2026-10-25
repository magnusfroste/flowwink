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

const SOURCE_TABLE: Record<ContentEntity, string> = { page: 'pages', blog_post: 'blog_posts' };
const SOURCE_COLUMNS: Record<ContentEntity, string> = {
  page: 'id, slug, title, status, locale, content_json, meta_json',
  blog_post: 'id, slug, title, status, locale, excerpt, content_json, meta_json, featured_image_alt',
};

export function isContentEntity(v: unknown): v is ContentEntity {
  return v === 'page' || v === 'blog_post';
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
  q = where.id ? q.eq('id', where.id) : q.eq('slug', String(where.slug ?? '').trim());
  const { data, error } = await q.maybeSingle();
  if (error) throw new Error(`${SOURCE_TABLE[entity]} read failed: ${error.message}`);
  if (!data) return null;
  const row = data as unknown as Record<string, unknown>;
  return {
    entity,
    id: String(row.id),
    slug: String(row.slug ?? ''),
    title: String(row.title ?? ''),
    status: String(row.status ?? ''),
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
  let written: { status: string; coverage: number | null } | null;
  try {
    written = await upsertContentOverlay(supabase, {
      entity: src.entity, entity_id: src.id, locale, status, strings: out.strings, coverage: out.coverage,
      translated_at: new Date().toISOString(), translated_by: sourceLabel,
      ...(existing?.slug ? { slug: existing.slug } : {}),
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
