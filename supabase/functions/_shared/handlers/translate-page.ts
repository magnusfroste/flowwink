/**
 * translate_page — translate one page's text into its own locale, server-side.
 *
 * The agent names the page; the platform walks the block tree, translates the
 * prose in bounded batches through the instance's AI, and writes the same tree
 * back with the strings replaced. The agent never carries content_json through
 * its context, so a page cannot come back shorter, reordered or half done —
 * the structure is preserved by construction and the result says exactly how
 * many strings were translated and how many were not.
 *
 * Why it exists: on www.flowwink.com (2026-09-04) FlowChat, asked to translate
 * 16 copied pages, published English as Swedish, cut the home page from 24
 * blocks to 11 and translated the wrong locale's drafts. The instructions said
 * "rewrite the text through manage_page update" — that is 40 KB per page
 * through a chat context. This is the rail that should have existed.
 */
import { applyTranslations, batchStrings, collectTranslatable, structureSignature } from '../i18n/translate-walk.ts';
import { translateAll } from '../i18n/translate.ts';

export interface TranslatePageArgs {
  /** The page to translate — the target-language row (e.g. "home-sv"). */
  slug?: string;
  page_id?: string;
  /** Alternative: the source page plus the language; the version is found or created. */
  source_slug?: string;
  locale?: string;
  /** Publish when done. Default false — a draft is what a person reviews. */
  publish?: boolean;
  /** Report what would be translated without calling the model or writing. */
  dry_run?: boolean;
  /** Glossary / tone notes for the translator. */
  context?: string;
}

const MAX_BATCHES = 24;

async function siteDefaultLocale(supabase: any): Promise<string> {
  const { data, error } = await supabase.from('site_settings').select('value').eq('key', 'site_languages').maybeSingle();
  if (error) throw new Error(`site_languages read failed: ${error.message}`);
  const d = (data?.value as any)?.default;
  return typeof d === 'string' && d.trim() ? d.trim().toLowerCase() : 'en';
}

async function loadPage(supabase: any, where: { slug?: string; id?: string }) {
  let q = supabase.from('pages').select('id, slug, title, status, locale, translation_group_id, content_json, meta_json').is('deleted_at', null);
  q = where.id ? q.eq('id', where.id) : q.eq('slug', where.slug);
  const { data, error } = await q.maybeSingle();
  if (error) throw new Error(`page read failed: ${error.message}`);
  return data as any | null;
}

export async function handleTranslatePage(supabase: any, args: TranslatePageArgs): Promise<Record<string, unknown>> {
  const defaultLocale = await siteDefaultLocale(supabase);
  let target: any = null;

  if (args.slug || args.page_id) {
    target = await loadPage(supabase, args.page_id ? { id: String(args.page_id) } : { slug: String(args.slug).trim() });
    if (!target) return { success: false, error: `No page "${args.slug ?? args.page_id}" (or it is in the trash).` };
  } else if (args.source_slug && args.locale) {
    const locale = String(args.locale).trim().toLowerCase();
    const source = await loadPage(supabase, { slug: String(args.source_slug).trim() });
    if (!source) return { success: false, error: `No source page "${args.source_slug}".` };
    if (source.translation_group_id) {
      const { data: sibling, error: sibErr } = await supabase
        .from('pages').select('id, slug, title, status, locale, translation_group_id, content_json, meta_json')
        .eq('translation_group_id', source.translation_group_id).eq('locale', locale).is('deleted_at', null).maybeSingle();
      if (sibErr) throw new Error(`sibling read failed: ${sibErr.message}`);
      target = sibling;
    }
    if (!target) {
      const { data: created, error: createErr } = await supabase.rpc('manage_page_translation', {
        p_action: 'create', p_slug: source.slug, p_locale: locale, p_target_slug: null, p_title: null,
      });
      if (createErr) return { success: false, error: `Could not create the ${locale} version: ${createErr.message}` };
      target = await loadPage(supabase, { slug: String((created as any)?.slug ?? '') });
      if (!target) return { success: false, error: 'The version was created but could not be read back.' };
    }
  } else {
    return { success: false, error: 'Give slug (or page_id) of the page to translate, or source_slug + locale.' };
  }

  const to = String(target.locale ?? '').toLowerCase();
  if (!to) return { success: false, error: `Page "${target.slug}" has no locale — set one with manage_page_translation set_locale first.` };

  // The source is the site-language sibling in the same group; without one the
  // page is translated in place from whatever language it is in.
  let source: any = null;
  if (target.translation_group_id) {
    const { data: sib, error: sibErr } = await supabase
      .from('pages').select('id, slug, locale, content_json')
      .eq('translation_group_id', target.translation_group_id).eq('locale', defaultLocale).neq('id', target.id).is('deleted_at', null).maybeSingle();
    if (sibErr) throw new Error(`source read failed: ${sibErr.message}`);
    source = sib;
  }
  if (to === defaultLocale && source) {
    return { success: false, error: `"${target.slug}" is the ${defaultLocale} version — translate_page targets the other languages.` };
  }
  const from = source ? defaultLocale : 'auto';

  // Translate the target's own text: an untranslated copy equals the source,
  // a half-done page keeps its Swedish and gets the rest.
  const doc = { title: target.title ?? '', meta_json: target.meta_json ?? {}, content_json: target.content_json ?? [] };
  const found = collectTranslatable(doc);
  const numbered = found.map((f, i) => ({ i, text: f.text }));
  const batches = batchStrings(numbered);
  const blocks = Array.isArray(doc.content_json) ? doc.content_json.length : 0;

  if (args.dry_run) {
    return {
      success: true, dry_run: true, slug: target.slug, locale: to, from, blocks,
      strings_found: found.length, batches: batches.length,
      sample: found.slice(0, 8).map((f) => f.text.slice(0, 80)),
      note: 'Nothing was translated or written. Call again without dry_run to translate.',
    };
  }
  if (!found.length) {
    return { success: true, slug: target.slug, locale: to, blocks, strings_found: 0, strings_translated: 0, note: 'No translatable text on this page.' };
  }

  const truncated = batches.length > MAX_BATCHES;
  const run = truncated ? batches.slice(0, MAX_BATCHES) : batches;
  const { translations, untranslated } = await translateAll(supabase, numbered, { to, from, context: args.context, source: 'translate_page' }, run);

  const replacements = found
    .map((f, i) => ({ path: f.path, text: translations.get(i) ?? '' }))
    .filter((r) => r.text);
  const next = applyTranslations(doc, replacements) as typeof doc;

  const before = structureSignature(doc.content_json);
  const after = structureSignature(next.content_json);
  if (before !== after) {
    return { success: false, error: 'Structure changed during translation — nothing was written.', blocks };
  }

  const patch: Record<string, unknown> = {
    title: next.title, meta_json: next.meta_json, content_json: next.content_json, updated_at: new Date().toISOString(),
  };
  if (args.publish && !truncated && untranslated.length === 0) patch.status = 'published';
  const { data: written, error: writeErr } = await supabase.from('pages').update(patch).eq('id', target.id).select('id, status').maybeSingle();
  if (writeErr) return { success: false, error: `write failed: ${writeErr.message}` };
  if (!written) return { success: false, error: 'The page vanished before the write.' };

  const left = untranslated.length + (truncated ? numbered.length - run.flat().length : 0);
  return {
    success: true,
    slug: target.slug,
    locale: to,
    from,
    blocks,
    strings_found: found.length,
    strings_translated: replacements.length,
    strings_untranslated: left,
    batches: run.length,
    status: written.status,
    published: written.status === 'published',
    ...(truncated ? { note: `Large page: ${run.length} of ${batches.length} batches done. Call again to continue; already-translated text is kept.` } : {}),
    ...(left && !truncated ? { note: `${left} string(s) came back untranslated — call again, or fix them in the editor.` } : {}),
    ...(args.publish && !patch.status ? { note: 'Not published: translate the remaining strings first, then publish.' } : {}),
  };
}
