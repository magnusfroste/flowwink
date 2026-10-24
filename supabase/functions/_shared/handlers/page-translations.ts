/**
 * The overlay writers — translate_page's overlay path, set_translation,
 * publish_translation, enable_language, list_stale_translations.
 *
 * A page is designed once (pages.content_json, in the site's language); every
 * other language is a row in page_translations carrying only strings, keyed
 * per unit. These handlers write that row. The text goes model → overlay
 * server-side; the agent's context never carries content_json.
 *
 * Legacy: a page that still has SIBLING ROWS (translation_group_id, the
 * pre-overlay model) keeps the old translate_page behaviour until the
 * conversion (step 5) runs on its instance. `pageHasSibling()` is the switch.
 *
 * Design: docs/architecture/page-translations.md §5.4, §8 step 3.
 */
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { batchStrings, structureSignature } from '../i18n/translate-walk.ts';
import { translateAll } from '../i18n/translate.ts';
import { collectUnits, diffOverlay, isTiptapDoc, type OverlayEntry } from '../i18n/translation-units.ts';
import { assembleOverlay, coverageOf, numberForTranslation, planOverlayWrite } from '../i18n/overlay-write.ts';

const MAX_BATCHES = 24;

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

export interface OverlayRowDb {
  page_id: string;
  locale: string;
  status: string;
  slug: string | null;
  strings: Record<string, OverlayEntry> | null;
  coverage: number | null;
  translated_at: string | null;
  translated_by: string | null;
}

interface TiptapLike { content?: unknown }

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

async function loadOverlay(supabase: SupabaseClient, pageId: string, locale: string) {
  const { data, error } = await supabase
    .from('page_translations').select('page_id, locale, status, slug, strings, coverage, translated_at, translated_by')
    .eq('page_id', pageId).eq('locale', locale).maybeSingle();
  if (error) {
    if (String(error.code) === '42P01') throw new Error('page_translations does not exist on this instance — apply migration 20261025010000 first.');
    throw new Error(`overlay read failed: ${error.message}`);
  }
  return (data as OverlayRowDb | null) ?? null;
}

export interface TranslateIntoOverlayArgs {
  publish?: boolean;
  dry_run?: boolean;
  force?: boolean;
  context?: string;
  source?: string;
}

/**
 * translate_page, overlay path: translate the page's missing and stale units
 * into `locale` and upsert the overlay. Fresh entries are never rewritten.
 */
export async function translateIntoOverlay(supabase: SupabaseClient, page: PageRow, locale: string, args: TranslateIntoOverlayArgs): Promise<Record<string, unknown>> {
  const from = String(page.locale ?? '').toLowerCase() || 'auto';
  const units = collectUnits({ title: page.title, meta_json: page.meta_json, content_json: page.content_json });
  const existing = await loadOverlay(supabase, page.id, locale);
  const strings = (existing?.strings ?? null) as Record<string, OverlayEntry> | null;
  const plan = planOverlayWrite(units, strings, { force: !!args.force });
  const numbering = numberForTranslation(plan.translate);
  const batches = batchStrings(numbering.items);
  const blocks = Array.isArray(page.content_json) ? page.content_json.length : 0;

  const base = {
    slug: page.slug, locale, from, mode: 'overlay', blocks,
    units_total: plan.total, units_missing: plan.missing.length, units_stale: plan.stale.length,
    units_kept: Object.keys(plan.keep).length, orphans: plan.orphans.length,
    overlay_status: existing?.status ?? null,
  };

  if (args.dry_run) {
    return {
      success: true, dry_run: true, ...base,
      strings_to_translate: numbering.items.length, batches: batches.length,
      sample: numbering.items.slice(0, 8).map((it) => it.text.slice(0, 80)),
      note: 'Nothing was translated or written. Call again without dry_run to translate.',
    };
  }

  let translations = new Map<number, string>();
  let untranslatedIdx: number[] = [];
  let truncated = false;
  if (numbering.items.length) {
    truncated = batches.length > MAX_BATCHES;
    const run = truncated ? batches.slice(0, MAX_BATCHES) : batches;
    const res = await translateAll(supabase, numbering.items, { to: locale, from, context: args.context, source: args.source ?? 'translate_page' }, run);
    translations = res.translations;
    untranslatedIdx = res.untranslated;
  }
  const out = assembleOverlay(plan, numbering, translations, strings);

  // Structure guard on every doc we are about to store.
  for (const unit of plan.translate) {
    if (unit.kind !== 'doc') continue;
    const stored = out.strings[unit.unit]?.doc;
    if (stored && structureSignature((stored as TiptapLike).content) !== structureSignature((unit.doc as TiptapLike).content)) {
      return { success: false, error: `Structure of ${unit.unit} changed during translation — nothing was written.`, ...base };
    }
  }

  const complete = out.untranslated.length === 0 && !truncated;
  const status = args.publish && complete ? 'published' : (existing?.status ?? 'draft');
  const row = {
    page_id: page.id, locale, status, strings: out.strings, coverage: out.coverage,
    translated_at: new Date().toISOString(), translated_by: args.source ?? 'translate_page',
    ...(existing?.slug ? { slug: existing.slug } : {}),
  };
  const { data: written, error: writeErr } = await supabase
    .from('page_translations').upsert(row, { onConflict: 'page_id,locale' }).select('status, coverage').maybeSingle();
  if (writeErr) return { success: false, error: `overlay write failed: ${writeErr.message}`, ...base };

  const left = out.untranslated.length + (truncated ? numbering.items.length - batches.slice(0, MAX_BATCHES).flat().length : 0);
  return {
    success: true, ...base,
    strings_sent: numbering.items.length, strings_untranslated: untranslatedIdx.length,
    units_translated: out.translated.length, units_untranslated: out.untranslated.length,
    coverage: written?.coverage ?? out.coverage,
    status: written?.status ?? status, published: (written?.status ?? status) === 'published',
    batches: Math.min(batches.length, MAX_BATCHES),
    ...(truncated ? { note: `Large page: ${MAX_BATCHES} of ${batches.length} batches done. Call again to continue; translated units are kept.` } : {}),
    ...(left && !truncated ? { note: `${out.untranslated.length} unit(s) came back untranslated — call again, or set them with set_translation.` } : {}),
    ...(args.publish && status !== 'published' ? { note: 'Not published: translate the remaining units first, then publish_translation.' } : {}),
  };
}

// ── set_translation ────────────────────────────────────────────────────────

export interface SetTranslationArgs {
  slug?: string;
  page_id?: string;
  locale?: string;
  unit?: string;
  text?: string;
  doc?: unknown;
  remove?: boolean;
}

export async function handleSetTranslation(supabase: SupabaseClient, args: SetTranslationArgs): Promise<Record<string, unknown>> {
  const locale = normalizeLocale(args.locale);
  if (!locale) return { success: false, error: 'locale is required: "en", "de", "en-GB".' };
  if (!args.slug && !args.page_id) return { success: false, error: 'Give slug or page_id of the page (the source page, not a translation).' };
  const page = await loadPageBySlugOrId(supabase, args.page_id ? { id: String(args.page_id) } : { slug: String(args.slug).trim() });
  if (!page) return { success: false, error: `No page "${args.slug ?? args.page_id}".` };
  if (String(page.locale ?? '').toLowerCase() === locale) return { success: false, error: `"${page.slug}" is written in ${locale} — edit the page itself (manage_page).` };
  const unitKey = String(args.unit ?? '').trim();
  if (!unitKey) return { success: false, error: 'unit is required, e.g. "b7f3a.data.title" or "page.title". list_stale_translations names them.' };

  const units = collectUnits({ title: page.title, meta_json: page.meta_json, content_json: page.content_json });
  const unit = units.find((u) => u.unit === unitKey);
  if (!unit) {
    const near = units.filter((u) => u.unit.startsWith(unitKey.split('.')[0])).map((u) => u.unit).slice(0, 12);
    return { success: false, error: `No unit "${unitKey}" on "${page.slug}".`, units_on_page: units.length, ...(near.length ? { same_block: near } : {}) };
  }

  const existing = await loadOverlay(supabase, page.id, locale);
  const strings = { ...((existing?.strings ?? {}) as Record<string, OverlayEntry>) };
  if (args.remove) {
    delete strings[unitKey];
  } else if (unit.kind === 'doc') {
    if (!isTiptapDoc(args.doc)) return { success: false, error: `"${unitKey}" is a rich-text unit — give doc (a Tiptap document), not text.` };
    strings[unitKey] = { doc: args.doc, source_hash: unit.hash };
  } else {
    const text = String(args.text ?? '').trim();
    if (!text) return { success: false, error: `"${unitKey}" is a text unit — give text.` };
    strings[unitKey] = { text, source_hash: unit.hash };
  }
  const coverage = coverageOf(units, strings);
  const { data: written, error } = await supabase.from('page_translations').upsert({
    page_id: page.id, locale, strings, coverage,
    status: existing?.status ?? 'draft',
    translated_at: new Date().toISOString(), translated_by: 'set_translation',
    ...(existing?.slug ? { slug: existing.slug } : {}),
  }, { onConflict: 'page_id,locale' }).select('status, coverage').maybeSingle();
  if (error) return { success: false, error: `overlay write failed: ${error.message}` };
  return {
    success: true, slug: page.slug, locale, unit: unitKey, removed: !!args.remove,
    source_text: unit.kind === 'doc' ? undefined : unit.text,
    coverage: written?.coverage ?? coverage, status: written?.status ?? existing?.status ?? 'draft',
    note: args.remove ? 'The unit now shows the source text until translated again.' : 'Fresh by definition: stamped with the current source hash.',
  };
}

// ── publish_translation ────────────────────────────────────────────────────

export interface PublishTranslationArgs {
  slug?: string;
  page_id?: string;
  locale?: string;
  status?: string;
  min_coverage?: number;
  translated_slug?: string | null;
}

export async function handlePublishTranslation(supabase: SupabaseClient, args: PublishTranslationArgs): Promise<Record<string, unknown>> {
  const locale = normalizeLocale(args.locale);
  if (!locale) return { success: false, error: 'locale is required.' };
  if (!args.slug && !args.page_id) return { success: false, error: 'Give slug or page_id of the page.' };
  const page = await loadPageBySlugOrId(supabase, args.page_id ? { id: String(args.page_id) } : { slug: String(args.slug).trim() });
  if (!page) return { success: false, error: `No page "${args.slug ?? args.page_id}".` };
  const existing = await loadOverlay(supabase, page.id, locale);
  if (!existing) return { success: false, error: `"${page.slug}" has no ${locale} overlay yet — translate_page(slug, locale) first.` };

  const status = String(args.status ?? 'published').toLowerCase();
  if (!['published', 'draft'].includes(status)) return { success: false, error: 'status must be published or draft.' };
  const units = collectUnits({ title: page.title, meta_json: page.meta_json, content_json: page.content_json });
  const coverage = coverageOf(units, existing.strings);
  const floor = typeof args.min_coverage === 'number' ? Math.max(0, Math.min(100, args.min_coverage)) : null;
  if (status === 'published' && floor !== null && coverage < floor) {
    return { success: false, error: `Coverage is ${coverage}%, below the floor ${floor}% — translate the rest first.`, coverage, slug: page.slug, locale };
  }
  const patch: Record<string, unknown> = { status, coverage };
  if (args.translated_slug !== undefined) {
    const s = args.translated_slug === null ? null : String(args.translated_slug).trim().toLowerCase().replace(/^\/+|\/+$/g, '');
    patch.slug = s || null;
  }
  const { data: written, error } = await supabase.from('page_translations').update(patch).eq('page_id', page.id).eq('locale', locale).select('status, coverage, slug').maybeSingle();
  if (error) return { success: false, error: `overlay update failed: ${error.message}` };
  const d = diffOverlay(units, existing.strings);
  return {
    success: true, slug: page.slug, locale, status: written?.status, coverage: written?.coverage, translated_slug: written?.slug ?? null,
    page_status: page.status,
    fallback_units: d.missing.length, stale_units: d.stale.length,
    ...(page.status !== 'published' ? { note: 'The page itself is not published — visitors see neither it nor this translation until it is.' } : {}),
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
  type OverlayLite = Pick<OverlayRowDb, 'page_id' | 'status' | 'coverage'>;
  const all = (pages ?? []) as Lite[];
  const source = all.filter((p) => String(p.locale ?? langs.default).toLowerCase() === langs.default);
  const { data: overlays, error: oErr } = await supabase.from('page_translations').select('page_id, status, coverage').eq('locale', locale);
  if (oErr && String(oErr.code) !== '42P01') return { success: false, error: `overlay read failed: ${oErr.message}` };
  const byPage = new Map<string, OverlayLite>(((overlays ?? []) as OverlayLite[]).map((o) => [o.page_id, o]));
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
    note: `Nothing was copied. Run translate_page(slug, locale: "${locale}") per page, then translate_ui_text("${locale}"), then publish_translation. The switcher lists a page in ${locale} only when its overlay is published.`,
  };
}

// ── list_stale_translations ────────────────────────────────────────────────

export interface ListStaleArgs {
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
  const locales = (wanted ? [wanted] : langs.enabled).filter((l) => l !== langs.default);
  const includeMissing = args.include_missing !== false;
  const limit = Math.max(1, Math.min(Number(args.limit ?? 200), 1000));

  let q = supabase.from('pages').select('id, slug, title, status, locale, translation_group_id, content_json, meta_json').is('deleted_at', null).eq('status', 'published');
  if (args.slug) q = q.eq('slug', String(args.slug).trim());
  const { data: pages, error: pErr } = await q;
  if (pErr) return { success: false, error: `pages read failed: ${pErr.message}` };
  const source = ((pages ?? []) as PageRow[]).filter((p) => String(p.locale ?? langs.default).toLowerCase() === langs.default);

  const { data: overlays, error: oErr } = await supabase.from('page_translations').select('page_id, locale, status, strings');
  const overlayTable = !(oErr && String(oErr.code) === '42P01');
  if (oErr && overlayTable) return { success: false, error: `overlay read failed: ${oErr.message}` };
  const key = (pid: string, l: string) => `${pid}@${l}`;
  type OverlayLite = Pick<OverlayRowDb, 'page_id' | 'locale' | 'status' | 'strings'>;
  const byKey = new Map<string, OverlayLite>(((overlays ?? []) as OverlayLite[]).map((o) => [key(o.page_id, o.locale), o]));

  const findings: Array<Record<string, unknown>> = [];
  let unitsListed = 0;
  for (const p of source) {
    const units = collectUnits({ title: p.title, meta_json: p.meta_json, content_json: p.content_json });
    for (const l of locales) {
      const o = byKey.get(key(p.id, l));
      if (!o) {
        if (p.translation_group_id) continue; // legacy sibling model — reported by the RPC below
        if (includeMissing) findings.push({ slug: p.slug, locale: l, overlay: 'none', units_total: units.length, missing: units.length, stale: 0 });
        continue;
      }
      const d = diffOverlay(units, o.strings);
      if (!d.missing.length && !d.stale.length) continue;
      const list = [
        ...d.stale.map((u) => ({ unit: u.unit, kind: u.kind, state: 'stale', source_text: u.kind === 'doc' ? undefined : u.text.slice(0, 120) })),
        ...(includeMissing ? d.missing.map((u) => ({ unit: u.unit, kind: u.kind, state: 'missing', source_text: u.kind === 'doc' ? undefined : u.text.slice(0, 120) })) : []),
      ].slice(0, Math.max(0, limit - unitsListed));
      unitsListed += list.length;
      findings.push({ slug: p.slug, locale: l, overlay: o.status, units_total: units.length, missing: d.missing.length, stale: d.stale.length, orphans: d.orphans.length, units: list });
    }
  }

  // Legacy sibling rows, until the conversion runs on this instance.
  let legacy: unknown = null;
  const { data: rpc, error: rErr } = await supabase.rpc('list_stale_translations', { p_min_hours: Math.max(1, Number(args.min_hours ?? 24)) });
  const staleRows = (rpc as { stale?: unknown } | null)?.stale;
  if (!rErr && Array.isArray(staleRows) && staleRows.length) legacy = staleRows;

  return {
    success: true, source_language: langs.default, locales,
    pages_checked: source.length, findings: findings.length,
    units_missing: findings.reduce((n, f) => n + Number(f.missing ?? 0), 0),
    units_stale: findings.reduce((n, f) => n + Number(f.stale ?? 0), 0),
    stale: findings,
    ...(legacy ? { legacy_siblings: legacy, legacy_note: 'Pages still stored as sibling rows (pre-overlay). convert_translation_groups moves them.' } : {}),
    ...(!overlayTable ? { note: 'page_translations does not exist on this instance yet.' } : {}),
    how_to_fix: 'translate_page(slug, locale) rewrites exactly the missing and stale units; set_translation(slug, locale, unit, text) fixes one by hand.',
  };
}
