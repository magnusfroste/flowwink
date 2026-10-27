/**
 * The overlay writers — translate_page's overlay path, set_translation,
 * publish_translation, enable_language, list_stale_translations.
 *
 * A page is designed once (pages.content_json, in the site's language); every
 * other language is a row in content_translations (entity 'page') carrying
 * only strings, keyed per unit. These handlers write that row. The text goes
 * model → overlay server-side; the agent's context never carries content_json.
 * set_translation, publish_translation and list_stale_translations also take
 * blog posts (`entity: 'blog_post'`) — the same overlay, another source table.
 *
 * Legacy: a page that still has SIBLING ROWS (translation_group_id, the
 * pre-overlay model) keeps the old translate_page behaviour until the
 * conversion (step 5) runs on its instance. `pageHasSibling()` is the switch.
 *
 * Design: docs/architecture/page-translations.md §5.4, §8 step 3.
 */
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { collectPostUnits, collectUnits, diffOverlay, isTiptapDoc, type ContentEntity, type OverlayEntry, collectAttributeUnits, collectProductUnits } from '../i18n/translation-units.ts';
import { coverageOf } from '../i18n/overlay-write.ts';
import { pairSiblingUnits } from '../i18n/convert-siblings.ts';
import {
  isContentEntity, isMissingRelation, listContentOverlays, loadContentOverlay, loadContentSource, translateContentIntoOverlay,
  updateContentOverlay, upsertContentOverlay, type ContentSource, type TranslateIntoOverlayArgs,
} from './content-overlay.ts';

export type { TranslateIntoOverlayArgs } from './content-overlay.ts';

export interface PageRow {
  id: string;
  slug: string;
  title: string;
  status: string;
  locale: string | null;
  translation_group_id: string | null;
  content_json: unknown;
  meta_json: unknown;
}

const LOCALE_RE = /^[a-z]{2}(-[a-z0-9]{2,8})?$/;

export function normalizeLocale(raw: unknown): string | null {
  const l = String(raw ?? '').trim().toLowerCase();
  return LOCALE_RE.test(l) ? l : null;
}

export async function siteLanguages(supabase: SupabaseClient): Promise<{ default: string; enabled: string[] }> {
  const { data, error } = await supabase.from('site_settings').select('value').eq('key', 'site_languages').maybeSingle();
  if (error) throw new Error(`site_languages read failed: ${error.message}`);
  const v = (data?.value ?? {}) as { default?: string; enabled?: string[] };
  const def = typeof v.default === 'string' && v.default.trim() ? v.default.trim().toLowerCase() : 'en';
  const enabled = Array.isArray(v.enabled) ? v.enabled.map((x) => String(x).toLowerCase()) : [def];
  return { default: def, enabled: enabled.includes(def) ? enabled : [def, ...enabled] };
}

export async function loadPageBySlugOrId(supabase: SupabaseClient, where: { slug?: string; id?: string }) {
  let q = supabase.from('pages').select('id, slug, title, status, locale, translation_group_id, content_json, meta_json').is('deleted_at', null);
  q = where.id ? q.eq('id', where.id) : q.eq('slug', where.slug);
  const { data, error } = await q.maybeSingle();
  if (error) throw new Error(`page read failed: ${error.message}`);
  return (data as PageRow | null) ?? null;
}

/** The pre-overlay model: a sibling row in `locale` of the same translation group. */
export async function pageHasSibling(supabase: SupabaseClient, page: PageRow | null, locale: string): Promise<PageRow | null> {
  if (!page?.translation_group_id) return null;
  const { data, error } = await supabase
    .from('pages').select('id, slug, title, status, locale, translation_group_id, content_json, meta_json')
    .eq('translation_group_id', page.translation_group_id).eq('locale', locale).neq('id', page.id).is('deleted_at', null).maybeSingle();
  if (error) throw new Error(`sibling read failed: ${error.message}`);
  return (data as PageRow | null) ?? null;
}

function pageSource(page: PageRow): ContentSource {
  return {
    entity: 'page', id: page.id, slug: page.slug, title: page.title, status: page.status,
    locale: page.locale ? page.locale.toLowerCase() : null,
    units: collectUnits({ title: page.title, meta_json: page.meta_json, content_json: page.content_json }),
  };
}

/**
 * translate_page, overlay path: translate the page's missing and stale units
 * into `locale` and upsert the overlay. Fresh entries are never rewritten.
 */
export async function translateIntoOverlay(supabase: SupabaseClient, page: PageRow, locale: string, args: TranslateIntoOverlayArgs): Promise<Record<string, unknown>> {
  const blocks = Array.isArray(page.content_json) ? page.content_json.length : 0;
  return await translateContentIntoOverlay(supabase, pageSource(page), locale, { ...args, source: args.source ?? 'translate_page' }, { blocks });
}

/** The entity a writer was asked about; pages unless told otherwise. */
function entityOf(raw: unknown): ContentEntity | null {
  if (raw === undefined || raw === null || raw === '') return 'page';
  const e = String(raw).trim().toLowerCase().replace(/-/g, '_');
  const norm = e === 'post' || e === 'blog' ? 'blog_post'
    : e === 'products' ? 'product'
    : e === 'category' || e === 'categories' || e === 'product_categories' ? 'product_category'
    : e === 'attribute' || e === 'attributes' || e === 'product_attributes' || e === 'variant' || e === 'variant_label' || e === 'variant_labels' ? 'product_attribute'
    : e;
  return isContentEntity(norm) ? norm : null;
}
const NOUN: Record<ContentEntity, string> = { page: 'page', blog_post: 'post', product: 'product', product_category: 'category', product_attribute: 'attribute' };
const EDIT_SKILL: Record<ContentEntity, string> = { page: 'manage_page', blog_post: 'manage_blog_posts', product: 'manage_product', product_category: 'manage_product', product_attribute: 'manage_variant' };
const SOURCE_TABLE_OF: Record<ContentEntity, string> = { page: 'pages', blog_post: 'blog_posts', product: 'products', product_category: 'product_categories', product_attribute: 'product_attributes' };
const ENTITY_ERROR = 'entity must be "page", "blog_post", "product", "product_category" or "product_attribute".';
/** Entities named by id (no slug): a product, and a variant attribute (its name stands in as slug). */
const BY_ID = (e: ContentEntity) => e === 'product' || e === 'product_attribute';
/** The id a caller gave under any of its names. */
function entityIdOf(args: { page_id?: string; post_id?: string; product_id?: string; category_id?: string; attribute_id?: string; id?: string }): string | undefined {
  return args.page_id ?? args.post_id ?? args.product_id ?? args.category_id ?? args.attribute_id ?? args.id;
}

// ── set_translation ────────────────────────────────────────────────────────

/** One string of a batch: the same fields as the single form. */
export interface SetTranslationUnit {
  unit?: string;
  text?: string;
  doc?: unknown;
  remove?: boolean;
}

export interface SetTranslationArgs {
  /** 'page' (default), 'blog_post', 'product' or 'product_category'. */
  entity?: string;
  slug?: string;
  page_id?: string;
  post_id?: string;
  product_id?: string;
  category_id?: string;
  attribute_id?: string;
  id?: string;
  locale?: string;
  unit?: string;
  text?: string;
  doc?: unknown;
  remove?: boolean;
  /**
   * Many strings in ONE call (and one overlay write) instead of one call each.
   * Found on optic 2026-10-26: an agent translating a seven-block page by hand
   * made 14 calls in a row, ~5 s apiece. All or nothing: one bad entry and
   * nothing is written, every problem is listed so the next call can be right.
   */
  units?: SetTranslationUnit[];
}

/** The most strings one call may set — a page this large should use translate_page. */
export const SET_TRANSLATION_MAX_UNITS = 200;

type SourceUnit = ContentSource['units'][number];
type EntryResult =
  | { ok: true; unit: string; removed: boolean; source_text?: string }
  | { ok: false; unit: string; error: string; same_block?: string[] };

/** Put one entry into `strings` — or say why not. The single and the batch form share it. */
function writeEntry(units: SourceUnit[], strings: Record<string, OverlayEntry>, e: SetTranslationUnit, entity: ContentEntity, slug: string): EntryResult {
  const unitKey = String(e.unit ?? '').trim();
  if (!unitKey) return { ok: false, unit: '', error: `unit is required, e.g. ${entity === 'page' ? '"b7f3a.data.title" or "page.title"' : '"post.title" or "post.content"'}. list_stale_translations names them.` };
  const unit = units.find((u) => u.unit === unitKey);
  if (!unit) {
    const near = units.filter((u) => u.unit.startsWith(unitKey.split('.')[0])).map((u) => u.unit).slice(0, 12);
    return { ok: false, unit: unitKey, error: `No unit "${unitKey}" on "${slug}".`, ...(near.length ? { same_block: near } : {}) };
  }
  if (e.remove) {
    delete strings[unitKey];
    return { ok: true, unit: unitKey, removed: true };
  }
  if (unit.kind === 'doc') {
    if (!isTiptapDoc(e.doc)) return { ok: false, unit: unitKey, error: `"${unitKey}" is a rich-text unit — give doc (a Tiptap document), not text.` };
    strings[unitKey] = { doc: e.doc, source_hash: unit.hash };
    return { ok: true, unit: unitKey, removed: false };
  }
  const text = String(e.text ?? '').trim();
  if (!text) return { ok: false, unit: unitKey, error: `"${unitKey}" is a text unit — give text.` };
  strings[unitKey] = { text, source_hash: unit.hash };
  return { ok: true, unit: unitKey, removed: false, source_text: unit.text };
}

export async function handleSetTranslation(supabase: SupabaseClient, args: SetTranslationArgs): Promise<Record<string, unknown>> {
  const entity = entityOf(args.entity);
  if (!entity) return { success: false, error: ENTITY_ERROR };
  const locale = normalizeLocale(args.locale);
  if (!locale) return { success: false, error: 'locale is required: "en", "de", "en-GB".' };
  const id = entityIdOf(args);
  const noun = NOUN[entity];
  if (!args.slug && !id) return { success: false, error: `Give slug or ${noun}_id of the ${noun} (the source, not a translation).` };

  const batch = args.units !== undefined;
  if (batch) {
    if (!Array.isArray(args.units) || args.units.length === 0) return { success: false, error: 'units must be a non-empty list of { unit, text } / { unit, doc } / { unit, remove: true }.' };
    if (args.units.length > SET_TRANSLATION_MAX_UNITS) return { success: false, error: `At most ${SET_TRANSLATION_MAX_UNITS} units per call — for a whole page, translate_page translates every missing and stale unit in one call.` };
    const keys = args.units.map((u) => String(u?.unit ?? '').trim()).filter(Boolean);
    const twice = [...new Set(keys.filter((k, i) => keys.indexOf(k) !== i))];
    if (twice.length) return { success: false, error: `Each unit once per call — listed twice: ${twice.join(', ')}.` };
  }

  const src = await loadContentSource(supabase, entity, id ? { id: String(id) } : { slug: String(args.slug).trim() });
  if (!src) return { success: false, error: `No ${noun} "${args.slug ?? id}".` };
  if (String(src.locale ?? '').toLowerCase() === locale) return { success: false, error: `"${src.slug}" is written in ${locale} — edit the ${noun} itself (${EDIT_SKILL[entity]}).` };

  const units = src.units;
  const existing = await loadContentOverlay(supabase, entity, src.id, locale);
  const strings = { ...((existing?.strings ?? {}) as Record<string, OverlayEntry>) };
  const entries: SetTranslationUnit[] = batch ? args.units! : [{ unit: args.unit, text: args.text, doc: args.doc, remove: args.remove }];
  const results = entries.map((e) => writeEntry(units, strings, e ?? {}, entity, src.slug));
  const failed = results.filter((r): r is Extract<EntryResult, { ok: false }> => !r.ok);
  if (failed.length) {
    if (!batch) {
      const f = failed[0];
      return { success: false, error: f.error, ...(f.error.startsWith('No unit') ? { units_total: units.length } : {}), ...(f.same_block ? { same_block: f.same_block } : {}) };
    }
    return {
      success: false,
      error: `${failed.length} of ${entries.length} unit(s) could not be set — nothing was written. Fix these and send the whole list again.`,
      failed: failed.map((f) => ({ unit: f.unit, error: f.error, ...(f.same_block ? { same_block: f.same_block } : {}) })),
      units_total: units.length,
    };
  }

  const coverage = coverageOf(units, strings);
  let written: { status: string; coverage: number | null } | null;
  try {
    written = await upsertContentOverlay(supabase, {
      entity, entity_id: src.id, locale, strings, coverage,
      status: existing?.status ?? 'draft',
      translated_at: new Date().toISOString(), translated_by: 'set_translation',
      ...(existing?.slug ? { slug: existing.slug } : {}),
    });
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
  const status = written?.status ?? existing?.status ?? 'draft';
  const finalCoverage = written?.coverage ?? coverage;
  if (batch) {
    const ok = results as Extract<EntryResult, { ok: true }>[];
    const removed = ok.filter((r) => r.removed).map((r) => r.unit);
    return {
      success: true, entity, slug: src.slug, locale,
      set: ok.filter((r) => !r.removed).map((r) => r.unit), removed,
      coverage: finalCoverage, status,
      note: 'Fresh by definition: every unit stamped with the current source hash.',
    };
  }
  const one = results[0] as Extract<EntryResult, { ok: true }>;
  return {
    success: true, entity, slug: src.slug, locale, unit: one.unit, removed: one.removed,
    source_text: one.source_text,
    coverage: finalCoverage, status,
    note: one.removed ? 'The unit now shows the source text until translated again.' : 'Fresh by definition: stamped with the current source hash.',
  };
}

// ── publish_translation ────────────────────────────────────────────────────

export interface PublishTranslationArgs {
  /** 'page' (default), 'blog_post', 'product' or 'product_category'. */
  entity?: string;
  slug?: string;
  page_id?: string;
  post_id?: string;
  product_id?: string;
  category_id?: string;
  attribute_id?: string;
  id?: string;
  locale?: string;
  status?: string;
  min_coverage?: number;
  translated_slug?: string | null;
}

export async function handlePublishTranslation(supabase: SupabaseClient, args: PublishTranslationArgs): Promise<Record<string, unknown>> {
  const entity = entityOf(args.entity);
  if (!entity) return { success: false, error: ENTITY_ERROR };
  const locale = normalizeLocale(args.locale);
  if (!locale) return { success: false, error: 'locale is required.' };
  const noun = NOUN[entity];
  const id = entityIdOf(args);
  if (!args.slug && !id) {
    // Nothing named: every overlay in this language — one call for a whole
    // language, the way an operator actually publishes one (www 2026-10-25: 16 calls).
    if (args.translated_slug !== undefined) return { success: false, error: `translated_slug is per ${noun} — give slug.` };
    const { rows } = await listContentOverlays(supabase, entity, { locale, columns: 'entity_id' });
    const ids = rows.map((r) => r.entity_id);
    // Pages and posts are named by slug; a product by its id (it has no slug).
    let keys: Array<{ slug?: string; id?: string }> = [];
    if (ids.length) {
      let q = supabase.from(SOURCE_TABLE_OF[entity]).select(BY_ID(entity) ? 'id, name' : 'id, slug').in('id', ids);
      if (entity === 'page') q = q.is('deleted_at', null);
      const { data, error: listErr } = await q;
      if (listErr) return { success: false, error: `${noun} list failed: ${listErr.message}` };
      keys = ((data ?? []) as Array<{ id: string; slug?: string; name?: string }>)
        .map((r) => (BY_ID(entity) ? { id: r.id, slug: r.name } : { slug: r.slug }))
        .filter((k) => k.slug || k.id)
        .sort((a, b) => String(a.slug ?? '').localeCompare(String(b.slug ?? '')));
    }
    if (!keys.length) return { success: false, error: `No ${locale} overlays of ${noun}s on this site — ${entity === 'page' ? 'translate_page(slug, locale)' : `translate_content(entity: "${entity}", slug, locale)`} first.` };
    const results: Array<Record<string, unknown>> = [];
    for (const k of keys) {
      const r = await handlePublishTranslation(supabase, entity === 'product' ? { ...args, product_id: k.id } : entity === 'product_attribute' ? { ...args, attribute_id: k.id } : { ...args, slug: k.slug });
      results.push({ slug: k.slug, ...(entity === 'product' ? { product_id: k.id } : entity === 'product_attribute' ? { attribute_id: k.id } : {}), ...(r.success ? { status: r.status, coverage: r.coverage } : { error: r.error }) });
    }
    const failed = results.filter((r) => r.error);
    return {
      success: failed.length === 0, entity, locale, [`${noun}s`]: results.length,
      published: results.filter((r) => r.status === (args.status ?? 'published')).length,
      failed: failed.length, results,
      ...(failed.length ? { error: `${failed.length} ${noun}(s) not changed — see results.` } : {}),
    };
  }
  const src = await loadContentSource(supabase, entity, id ? { id: String(id) } : { slug: String(args.slug).trim() });
  if (!src) return { success: false, error: `No ${noun} "${args.slug ?? id}".` };
  const existing = await loadContentOverlay(supabase, entity, src.id, locale);
  if (!existing) return { success: false, error: `"${src.slug}" has no ${locale} overlay yet — ${entity === 'page' ? 'translate_page' : 'translate_content'}(${entity === 'page' ? 'slug' : `entity: "${entity}", ${entity === 'product' ? 'product_id' : entity === 'product_attribute' ? 'attribute_id' : 'slug'}`}, locale) first.` };

  const status = String(args.status ?? 'published').toLowerCase();
  if (!['published', 'draft'].includes(status)) return { success: false, error: 'status must be published or draft.' };
  const coverage = coverageOf(src.units, existing.strings);
  const floor = typeof args.min_coverage === 'number' ? Math.max(0, Math.min(100, args.min_coverage)) : null;
  if (status === 'published' && floor !== null && coverage < floor) {
    return { success: false, error: `Coverage is ${coverage}%, below the floor ${floor}% — translate the rest first.`, coverage, slug: src.slug, locale };
  }
  const patch: Record<string, unknown> = { status, coverage };
  if (args.translated_slug !== undefined) {
    const t = args.translated_slug === null ? null : String(args.translated_slug).trim().toLowerCase().replace(/^\/+|\/+$/g, '');
    patch.slug = t || null;
  }
  let written: { status: string; coverage: number | null; slug: string | null } | null;
  try {
    written = await updateContentOverlay(supabase, entity, src.id, locale, patch);
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
  const d = diffOverlay(src.units, existing.strings);
  return {
    success: true, entity, slug: src.slug, locale, status: written?.status, coverage: written?.coverage, translated_slug: written?.slug ?? null,
    [`${noun}_status`]: src.status,
    fallback_units: d.missing.length, stale_units: d.stale.length,
    ...(src.status !== 'published' ? { note: `The ${noun} itself is not published — visitors see neither it nor this translation until it is.` } : {}),
    ...(status === 'published' && (d.missing.length || d.stale.length) ? { note: `Published with ${d.missing.length} unit(s) showing the source text and ${d.stale.length} stale — visible, counted.` } : {}),
  };
}

// ── enable_language ────────────────────────────────────────────────────────

export interface EnableLanguageArgs {
  locale?: string;
  dry_run?: boolean;
}

/**
 * Adds a language to site_languages.enabled. Copies NOTHING: a language with
 * no overlays is an empty overlay. Returns the pages that have no published
 * overlay in it, so the caller can translate_page them one by one.
 */
export async function handleEnableLanguage(supabase: SupabaseClient, args: EnableLanguageArgs): Promise<Record<string, unknown>> {
  const locale = normalizeLocale(args.locale);
  if (!locale) return { success: false, error: 'Not a language tag. Use a form like "sv", "de" or "en-GB".' };
  const langs = await siteLanguages(supabase);
  if (locale === langs.default) return { success: false, error: `${locale} is the site's own language — nothing to enable.` };
  const already = langs.enabled.includes(locale);

  const { data: pages, error: pErr } = await supabase
    .from('pages').select('id, slug, title, locale, translation_group_id').is('deleted_at', null).eq('status', 'published');
  if (pErr) return { success: false, error: `pages read failed: ${pErr.message}` };
  type Lite = Pick<PageRow, 'id' | 'slug' | 'title' | 'locale' | 'translation_group_id'>;
  const all = (pages ?? []) as Lite[];
  const source = all.filter((p) => String(p.locale ?? langs.default).toLowerCase() === langs.default);
  let overlays: Awaited<ReturnType<typeof listContentOverlays>>['rows'];
  try {
    overlays = (await listContentOverlays(supabase, 'page', { locale, columns: 'entity_id, status, coverage' })).rows;
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
  const byPage = new Map(overlays.map((o) => [o.entity_id, o]));
  const siblingGroups = new Set<string>(all.filter((p) => String(p.locale ?? '').toLowerCase() === locale && p.translation_group_id).map((p) => p.translation_group_id as string));

  const todo = source
    .filter((p) => !(byPage.get(p.id)?.status === 'published') && !(p.translation_group_id && siblingGroups.has(p.translation_group_id)))
    .map((p) => { const o = byPage.get(p.id); return { slug: p.slug, title: p.title, overlay: o ? `${o.status} (${o.coverage ?? 0}%)` : 'none' }; });

  if (!args.dry_run && !already) {
    const { error: uErr } = await supabase.rpc('ensure_site_languages');
    if (uErr) return { success: false, error: `site_languages seed failed: ${uErr.message}` };
    const { data: row, error: rErr } = await supabase.from('site_settings').select('value').eq('key', 'site_languages').maybeSingle();
    if (rErr) return { success: false, error: rErr.message };
    const value = { ...((row?.value ?? {}) as Record<string, unknown>), enabled: [...langs.enabled, locale] };
    const { error: wErr } = await supabase.from('site_settings').update({ value }).eq('key', 'site_languages');
    if (wErr) return { success: false, error: `site_languages write failed: ${wErr.message}` };
  }
  return {
    success: true, dry_run: !!args.dry_run, locale, source_language: langs.default,
    enabled: args.dry_run ? already : true, was_enabled: already,
    pages_published: source.length, pages_to_translate: todo.length, todo: todo.slice(0, 50),
    copied: 0,
    note: `Nothing was copied. Run translate_page(slug, locale: "${locale}") per page, then translate_ui_text("${locale}"), then publish_translation. The switcher lists a page in ${locale} only when its overlay is published. Blog posts: translate_content(entity: "blog_post", slug, locale: "${locale}", publish: true) per post.`,
  };
}

// ── list_stale_translations ────────────────────────────────────────────────

export interface ListStaleArgs {
  /** 'page', 'blog_post', or omitted for both. */
  entity?: string;
  locale?: string;
  slug?: string;
  include_missing?: boolean;
  limit?: number;
  min_hours?: number;
}

export async function handleListStaleTranslations(supabase: SupabaseClient, args: ListStaleArgs): Promise<Record<string, unknown>> {
  const langs = await siteLanguages(supabase);
  const wanted = args.locale ? normalizeLocale(args.locale) : null;
  if (args.locale && !wanted) return { success: false, error: 'locale is not a language tag.' };
  // Every enabled language is a target for something: a page in the site
  // language is translated out of it, a post written in another language into it.
  const locales = wanted ? [wanted] : langs.enabled;
  const includeMissing = args.include_missing !== false;
  const limit = Math.max(1, Math.min(Number(args.limit ?? 200), 1000));

  const only = args.entity ? entityOf(args.entity) : null;
  if (args.entity && !only) return { success: false, error: ENTITY_ERROR };

  const findings: Array<Record<string, unknown>> = [];
  let unitsListed = 0;
  let overlayTable = true;
  let pagesChecked = 0;
  let postsChecked = 0;

  const report = (entity: ContentEntity, src: { id: string; slug: string; units: ReturnType<typeof collectUnits>; legacy?: boolean }, byKey: Map<string, { status: string; strings: Record<string, OverlayEntry> | null }>, ownLocale: string) => {
    for (const l of locales) {
      if (l === ownLocale) continue;
      const o = byKey.get(`${src.id}@${l}`);
      if (!o) {
        if (src.legacy) continue; // legacy sibling model — reported by the RPC below
        if (includeMissing) findings.push({ entity, slug: src.slug, locale: l, overlay: 'none', units_total: src.units.length, missing: src.units.length, stale: 0 });
        continue;
      }
      const d = diffOverlay(src.units, o.strings);
      if (!d.missing.length && !d.stale.length) continue;
      const list = [
        ...d.stale.map((u) => ({ unit: u.unit, kind: u.kind, state: 'stale', source_text: u.kind === 'doc' ? undefined : u.text.slice(0, 120) })),
        ...(includeMissing ? d.missing.map((u) => ({ unit: u.unit, kind: u.kind, state: 'missing', source_text: u.kind === 'doc' ? undefined : u.text.slice(0, 120) })) : []),
      ].slice(0, Math.max(0, limit - unitsListed));
      unitsListed += list.length;
      findings.push({ entity, slug: src.slug, locale: l, overlay: o.status, units_total: src.units.length, missing: d.missing.length, stale: d.stale.length, orphans: d.orphans.length, units: list });
    }
  };
  const overlayMap = async (entity: ContentEntity) => {
    const { rows, table } = await listContentOverlays(supabase, entity, { columns: 'entity_id, locale, status, strings' });
    if (!table) overlayTable = false;
    return new Map(rows.map((o) => [`${o.entity_id}@${o.locale}`, o]));
  };

  if (!only || only === 'page') {
    let q = supabase.from('pages').select('id, slug, title, status, locale, translation_group_id, content_json, meta_json').is('deleted_at', null).eq('status', 'published');
    if (args.slug) q = q.eq('slug', String(args.slug).trim());
    const { data: pages, error: pErr } = await q;
    if (pErr) return { success: false, error: `pages read failed: ${pErr.message}` };
    const source = ((pages ?? []) as PageRow[]).filter((p) => String(p.locale ?? langs.default).toLowerCase() === langs.default);
    let byKey;
    try { byKey = await overlayMap('page'); } catch (err) { return { success: false, error: (err as Error).message }; }
    for (const p of source) {
      pagesChecked += 1;
      report('page', { id: p.id, slug: p.slug, units: collectUnits({ title: p.title, meta_json: p.meta_json, content_json: p.content_json }), legacy: !!p.translation_group_id }, byKey, langs.default);
    }
  }

  if (!only || only === 'blog_post') {
    let q = supabase.from('blog_posts').select('id, slug, title, status, locale, excerpt, content_json, meta_json, featured_image_alt').eq('status', 'published');
    if (args.slug) q = q.eq('slug', String(args.slug).trim());
    const { data: posts, error: bErr } = await q;
    // An instance without blog_posts.locale yet has no post overlays to report.
    if (!bErr) {
      let byKey;
      try { byKey = await overlayMap('blog_post'); } catch (err) { return { success: false, error: (err as Error).message }; }
      for (const b of (posts ?? []) as Array<Record<string, unknown>>) {
        postsChecked += 1;
        const own = String(b.locale ?? langs.default).toLowerCase();
        report('blog_post', { id: String(b.id), slug: String(b.slug), units: collectPostUnits(b) }, byKey, own);
      }
    } else if (only === 'blog_post') {
      return { success: false, error: `blog_posts read failed: ${bErr.message}` };
    }
  }

  // Legacy sibling rows, until the conversion runs on this instance.
  let legacy: unknown = null;
  const { data: rpc, error: rErr } = await supabase.rpc('list_stale_translations', { p_min_hours: Math.max(1, Number(args.min_hours ?? 24)) });
  const staleRows = (rpc as { stale?: unknown } | null)?.stale;
  if (!rErr && Array.isArray(staleRows) && staleRows.length) legacy = staleRows;

  // Products and categories: the shop's text, in every language a visitor
  // can shop in (§10). Only active rows — an archived product has no public
  // version to be stale.
  for (const pe of ['product', 'product_category'] as const) {
    if (only && only !== pe) continue;
    const { data: prows, error: pErr } = await supabase
      .from(pe === 'product' ? 'products' : 'product_categories')
      .select(pe === 'product' ? 'id, name, description, locale' : 'id, slug, name, description, locale')
      .eq('is_active', true);
    if (pErr) {
      if (isMissingRelation(pErr)) continue;
      return { success: false, error: `${pe} read failed: ${pErr.message}` };
    }
    const byKey = await overlayMap(pe);
    for (const r of (prows ?? []) as unknown as Array<{ id: string; slug?: string; name: string; description: string | null; locale: string | null }>) {
      report(pe, { id: r.id, slug: r.slug ?? r.name, units: collectProductUnits(r, pe === 'product' ? 'product' : 'category') }, byKey, String(r.locale ?? langs.default).toLowerCase());
    }
  }

  // Variant labels (§10): every attribute's name and values, site-wide.
  if (!only || only === 'product_attribute') {
    const { data: arows, error: aErr } = await supabase
      .from('product_attributes')
      .select('id, name, locale, product_attribute_values(id, value, sort_order)');
    if (aErr) {
      if (!isMissingRelation(aErr)) return { success: false, error: `product_attributes read failed: ${aErr.message}` };
    } else {
      const byKey = await overlayMap('product_attribute');
      for (const r of (arows ?? []) as unknown as Array<{ id: string; name: string; locale: string | null; product_attribute_values: Array<{ id: string; value: string; sort_order: number }> | null }>) {
        const values = [...(r.product_attribute_values ?? [])].sort((a, b) => a.sort_order - b.sort_order || a.value.localeCompare(b.value));
        report('product_attribute', { id: r.id, slug: r.name, units: collectAttributeUnits({ name: r.name, product_attribute_values: values }) }, byKey, String(r.locale ?? langs.default).toLowerCase());
      }
    }
  }

  return {
    success: true, source_language: langs.default, locales,
    pages_checked: pagesChecked, posts_checked: postsChecked, findings: findings.length,
    units_missing: findings.reduce((n, f) => n + Number(f.missing ?? 0), 0),
    units_stale: findings.reduce((n, f) => n + Number(f.stale ?? 0), 0),
    stale: findings,
    ...(legacy ? { legacy_siblings: legacy, legacy_note: 'Pages still stored as sibling rows (pre-overlay). convert_translation_groups moves them.' } : {}),
    ...(!overlayTable ? { note: 'content_translations does not exist on this instance yet.' } : {}),
    how_to_fix: 'translate_page(slug, locale) — or translate_content(entity: "blog_post", slug, locale) for a post, translate_content(entity: "product", product_id, locale) for a product (its variant labels follow), translate_content(entity: "product_attribute", attribute_id, locale) for one attribute — rewrites exactly the missing and stale units; set_translation(entity, slug|product_id, locale, unit, text) fixes one by hand.',
  };
}

// ── convert_translation_groups ─────────────────────────────────────────────

export interface ConvertGroupsArgs {
  /** Default true: report the plan, write nothing. */
  dry_run?: boolean;
  /** Only the group this page belongs to (any version's slug). */
  slug?: string;
  /**
   * Per sibling slug, what to do when it carries text the source has no
   * place for: 'drop_extra' (the source structure is right — convert, the
   * extra text is listed and dropped) or 'keep_as_page' (it is a different
   * page — it leaves the group and stays a page). Without a decision such a
   * group is reported and NOT converted.
   */
  decisions?: Record<string, 'drop_extra' | 'keep_as_page'>;
  /** Max groups per run, default 50 (each group is a few writes). */
  limit?: number;
}

/**
 * Sibling rows → overlays (page-translations.md §6). Per group: the source is
 * the version in the site's language (else the oldest); every other version's
 * text is paired with the source's units and written as that language's
 * overlay with the source's CURRENT hashes; the sibling row is soft-deleted
 * and its old address redirects to /<lang>/<source slug>. Nothing is dropped
 * silently: text with no counterpart on the source stops the group until the
 * operator decides.
 */
export async function handleConvertTranslationGroups(supabase: SupabaseClient, args: ConvertGroupsArgs): Promise<Record<string, unknown>> {
  const dryRun = args.dry_run !== false;
  const decisions = args.decisions ?? {};
  const limit = Math.max(1, Math.min(Number(args.limit ?? 50), 200));
  const langs = await siteLanguages(supabase);

  const { data: general, error: generalErr } = await supabase.from('site_settings').select('value').eq('key', 'general').maybeSingle();
  if (generalErr) return { success: false, error: `general settings read failed: ${generalErr.message}` };
  const homepageSlug = String(((general?.value ?? {}) as { homepageSlug?: string }).homepageSlug || 'home');

  let q = supabase.from('pages')
    .select('id, slug, title, status, locale, translation_group_id, content_json, meta_json, created_at')
    .is('deleted_at', null).not('translation_group_id', 'is', null);
  if (args.slug) {
    const anchor = await loadPageBySlugOrId(supabase, { slug: String(args.slug).trim() });
    if (!anchor?.translation_group_id) return { success: false, error: `"${args.slug}" is not part of a translation group.` };
    q = q.eq('translation_group_id', anchor.translation_group_id);
  }
  const { data: rows, error } = await q;
  if (error) return { success: false, error: `pages read failed: ${error.message}` };

  type Row = PageRow & { created_at: string };
  const groups = new Map<string, Row[]>();
  for (const r of (rows ?? []) as Row[]) {
    const g = r.translation_group_id as string;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(r);
  }

  const report: Array<Record<string, unknown>> = [];
  let converted = 0, blocked = 0, keptAsPages = 0, overlaysWritten = 0, redirects = 0;

  for (const [group, members] of [...groups.entries()].slice(0, limit)) {
    if (members.length < 2) {
      // A group of one is nothing to convert; clear the stale id on a live run.
      if (!dryRun) await supabase.from('pages').update({ translation_group_id: null }).eq('id', members[0].id);
      report.push({ group, source: members[0].slug, note: 'group of one — id cleared', versions: [] });
      continue;
    }
    const sorted = [...members].sort((a, b) => a.created_at.localeCompare(b.created_at));
    const source = sorted.find((m) => String(m.locale ?? '').toLowerCase() === langs.default) ?? sorted[0];
    const sourceIsDefault = String(source.locale ?? '').toLowerCase() === langs.default;
    const versions: Array<Record<string, unknown>> = [];
    let groupBlocked = false;
    const actions: Array<() => Promise<void>> = [];

    for (const sib of sorted.filter((m) => m.id !== source.id)) {
      const locale = String(sib.locale ?? '').toLowerCase();
      const pairing = pairSiblingUnits(
        { title: source.title, meta_json: source.meta_json, content_json: source.content_json },
        { title: sib.title, meta_json: sib.meta_json, content_json: sib.content_json },
      );
      const decision = decisions[sib.slug];
      const needsDecision = pairing.extra.length > 0 && !decision;
      const toPath = pagePathFor(source.slug, locale, homepageSlug);
      versions.push({
        slug: sib.slug, locale, status: sib.status,
        paired: pairing.paired, paired_by_position: pairing.paired_by_position, paired_by_type: pairing.paired_by_type,
        missing: pairing.missing.length, untranslated_copies: pairing.untranslated.length,
        extra: pairing.extra, coverage: pairing.coverage,
        redirect: `/${sib.slug} → ${toPath}`,
        action: needsDecision ? 'needs_decision' : decision === 'keep_as_page' ? 'keep_as_page' : 'convert',
      });
      if (needsDecision) { groupBlocked = true; continue; }
      if (decision === 'keep_as_page') {
        actions.push(async () => {
          const { error: e } = await supabase.from('pages').update({ translation_group_id: null }).eq('id', sib.id);
          if (e) throw new Error(`${sib.slug}: ${e.message}`);
          keptAsPages += 1;
        });
        continue;
      }
      actions.push(async () => {
        try {
          await upsertContentOverlay(supabase, {
            entity: 'page', entity_id: source.id, locale, strings: pairing.strings, coverage: pairing.coverage,
            status: sib.status === 'published' ? 'published' : 'draft',
            translated_at: new Date().toISOString(), translated_by: 'conversion',
          });
        } catch (e) {
          throw new Error(`${sib.slug}: ${(e as Error).message}`);
        }
        overlaysWritten += 1;
        const { error: dErr } = await supabase.from('pages').update({ deleted_at: new Date().toISOString() }).eq('id', sib.id);
        if (dErr) throw new Error(`${sib.slug}: soft-delete failed: ${dErr.message}`);
        const { error: rErr } = await supabase.rpc('manage_redirect', {
          p_action: 'create', p_from_path: sib.slug, p_to_path: toPath, p_status_code: 301,
          p_note: `translation ${locale} of /${source.slug} — converted to an overlay`,
        });
        if (rErr) throw new Error(`${sib.slug}: redirect failed: ${rErr.message}`);
        redirects += 1;
      });
    }

    const entry: Record<string, unknown> = {
      group, source: source.slug, source_locale: source.locale,
      ...(sourceIsDefault ? {} : { note: `No version in the site language (${langs.default}); the oldest version is the source.` }),
      versions,
    };
    if (groupBlocked) {
      blocked += 1;
      entry.blocked = 'A version carries text the source has no place for. Decide per slug: decisions: { "<slug>": "drop_extra" | "keep_as_page" }.';
      report.push(entry);
      continue;
    }
    if (!dryRun) {
      try {
        for (const run of actions) await run();
        // Every sibling is now an overlay or its own page: the group is gone.
        const { error: cErr } = await supabase.from('pages').update({ translation_group_id: null }).eq('id', source.id);
        if (cErr) throw new Error(`${source.slug}: ${cErr.message}`);
        converted += 1;
        entry.converted = true;
      } catch (err) {
        entry.error = (err as Error).message;
      }
    }
    report.push(entry);
  }

  return {
    success: true, dry_run: dryRun, source_language: langs.default,
    groups: groups.size, groups_in_run: Math.min(groups.size, limit),
    converted, blocked, kept_as_pages: keptAsPages, overlays_written: overlaysWritten, redirects,
    report,
    note: dryRun
      ? 'Nothing was written. Review each group (paired / missing / extra), add decisions for blocked ones, then call again with dry_run: false.'
      : `${converted} group(s) converted. Untranslated units show the source text and are listed by list_stale_translations; translate_page fills them.`,
  };
}

/** The address of a page in a non-default language: /<lang>/<slug>, /<lang> for the homepage. */
function pagePathFor(slug: string, locale: string, homepageSlug: string): string {
  return slug === homepageSlug ? `/${locale}` : `/${locale}/${slug}`;
}
