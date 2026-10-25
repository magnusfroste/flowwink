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
import { listContentOverlays, loadContentSource, translateContentIntoOverlay } from './content-overlay.ts';
import { normalizeLocale, siteLanguages } from './page-translations.ts';
import { handleTranslatePage } from './translate-page.ts';

export interface TranslateContentArgs {
  /** 'blog_post' or 'page'. */
  entity?: string;
  slug?: string;
  id?: string;
  post_id?: string;
  page_id?: string;
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
  const raw = String(args.entity ?? '').trim().toLowerCase().replace(/-/g, '_');
  const entity = raw === 'post' || raw === 'blog' ? 'blog_post' : raw;
  if (entity === 'page') {
    return await handleTranslatePage(supabase, {
      slug: args.slug, page_id: args.page_id ?? args.id, locale: args.locale,
      publish: args.publish, dry_run: args.dry_run, force: args.force, context: args.context,
    });
  }
  if (entity !== 'blog_post') return { success: false, error: 'entity is required: "blog_post" (or "page" — the same as translate_page).' };

  const id = args.post_id ?? args.id;
  if (!args.slug && !id) return { success: false, error: 'Give slug or post_id of the post (the source post).' };
  const src = await loadContentSource(supabase, 'blog_post', id ? { id: String(id) } : { slug: String(args.slug) });
  if (!src) return { success: false, error: `No blog post "${args.slug ?? id}".` };

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
  if (results.length === 1) return results[0];
  const failed = results.filter((r) => !r.success);
  return {
    success: failed.length === 0, entity: 'blog_post', slug: src.slug, source_locale: own,
    languages: targets, results,
    ...(failed.length ? { error: `${failed.length} language(s) failed — see results.` } : {}),
  };
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
  const src = await loadContentSource(supabase, 'blog_post', { id: postId });
  if (!src) return { translations: [], skipped: 'post not found' };
  const langs = await siteLanguages(supabase);
  const own = String(src.locale ?? langs.default).toLowerCase();
  const { rows, table } = await listContentOverlays(supabase, 'blog_post', { ids: [postId], columns: 'entity_id, locale, status' });
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
        publish: opts.publish ?? existing.get(l) === 'published', context: opts.context, source: 'translate_content',
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
  return { translations };
}
