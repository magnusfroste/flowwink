import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import type { BlogPost } from '@/types/cms';
import { blogPostPath } from '@/lib/language-path';
import { postInLanguage, postsInLanguage, type PostRowLike } from '../../supabase/functions/_shared/i18n/post-language';
import type { OverlayRow } from '../../supabase/functions/_shared/i18n/resolve-page';
import type { OverlayEntry } from '../../supabase/functions/_shared/i18n/translation-units';

/**
 * Blog posts in a language, for the public readers (page-translations.md §9).
 * The rule itself — own language, published overlay, or absent — is
 * `postInLanguage` in _shared, shared with content-api and RSS.
 */

export type PostOverlayRow = OverlayRow & { entity_id: string };

/** A missing table/function: an instance that has not applied 20261025030000 yet. */
export function isMissingSchema(err: { code?: string | null; message?: string } | null | undefined): boolean {
  return !!err && (['42P01', '42703', '42883', 'PGRST202', 'PGRST205'].includes(String(err.code)) || /does not exist|schema cache/i.test(String(err.message ?? '')));
}

/** Published overlays of these posts in `lang` (RLS limits them to published posts). */
export async function loadPostOverlays(ids: string[], lang: string | null): Promise<PostOverlayRow[]> {
  if (!ids.length) return [];
  let q = supabase
    .from('content_translations')
    .select('entity_id, locale, status, slug, strings')
    .eq('entity', 'blog_post')
    .eq('status', 'published')
    .in('entity_id', ids);
  if (lang) q = q.eq('locale', lang);
  const { data, error } = await q;
  if (error) {
    if (!isMissingSchema(error)) logger.error('[blog] overlay read failed:', error);
    return [];
  }
  return (data ?? []).map((r) => ({
    entity_id: r.entity_id, locale: r.locale, status: r.status, slug: r.slug,
    strings: (r.strings ?? null) as unknown as Record<string, OverlayEntry> | null,
  }));
}

function served(post: BlogPost, r: ReturnType<typeof postInLanguage<BlogPost & PostRowLike>>, defaultLanguage: string): BlogPost {
  if (!r) return post;
  return {
    ...r.post,
    served_locale: r.locale,
    served_slug: r.slug,
    href: blogPostPath(r.slug, r.locale, defaultLanguage),
    ...(r.fallback_units.length ? { fallback_units: r.fallback_units } : {}),
  };
}

/** A list in `lang`: posts absent in it dropped, the rest with its text and address. */
export function localizePosts(posts: BlogPost[], lang: string, overlays: PostOverlayRow[], defaultLanguage: string): BlogPost[] {
  return postsInLanguage(posts as Array<BlogPost & PostRowLike>, lang, overlays, defaultLanguage)
    .map((r) => served(r.post, r, defaultLanguage));
}

/** One post in `lang`, or null when it has no version in that language. */
export function localizePost(post: BlogPost, lang: string, overlay: PostOverlayRow | null, defaultLanguage: string): BlogPost | null {
  const r = postInLanguage(post as BlogPost & PostRowLike, lang, overlay, defaultLanguage);
  return r ? served(post, r, defaultLanguage) : null;
}
