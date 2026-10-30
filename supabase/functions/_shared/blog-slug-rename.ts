/**
 * A blog post changes address without breaking a link.
 *
 * Optic, 2026-10-30: eleven posts were rewritten to new topics through the MCP
 * gateway and kept their old slugs, because `manage_blog_posts` could not
 * change one; a near-duplicate could not be unpublished either, because
 * `/blog/<slug>` did not consult `page_redirects` (www had already lost 29
 * published URLs that way). The rename is a skill parameter (`new_slug`) and
 * the 301 is the platform's write, not a step an agent may forget.
 *
 * Two halves, both here so the handler in agent-execute stays a call:
 *   checkBlogSlug   — normalise + refuse a slug another post (or another
 *                     post's translation) already answers at;
 *   redirectRenamedPost — after the row has its new slug: the 301
 *                     blog/<old> → blog/<new> through manage_redirect (the one
 *                     writer, with its loop guard), earlier redirects into the
 *                     old address re-pointed (no chains), a redirect FROM the
 *                     new address dropped (the post lives there now), and the
 *                     overlays whose slug was a copy of the old one moved along.
 *
 * `/<lang>/blog/<old>` needs no row of its own: the post page falls back to
 * `blog/<old>` and keeps the language prefix (src/lib/blog-redirect.ts).
 */
import { slugify } from './slugify.ts';

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the service-role client agent-execute holds; a fake in tests
type Db = any;

/** The one blog slug shape — the editor's and write_blog_post's. */
export function normaliseBlogSlug(value: unknown): string {
  return typeof value === 'string' ? slugify(value) : '';
}

/** The page_redirects path of a post in the site language (normalised: no leading slash, lower case). */
export const blogRedirectPath = (slug: string): string => `blog/${slug.toLowerCase()}`;

export type SlugCheck =
  | { ok: true; slug: string; unchanged: boolean }
  | { ok: false; error: string; code: 'INVALID_INPUT' | 'ALREADY_EXISTS'; retryable: false; hint: string };

export async function checkBlogSlug(supabase: Db, postId: string, currentSlug: string, requested: unknown): Promise<SlugCheck> {
  const next = normaliseBlogSlug(requested);
  if (!next) {
    return { ok: false, error: `new_slug "${String(requested ?? '')}" is empty after normalising.`, code: 'INVALID_INPUT', retryable: false,
      hint: 'Use lowercase letters, digits and hyphens, e.g. "ai-agents-in-practice".' };
  }
  if (next === currentSlug) return { ok: true, slug: next, unchanged: true };
  const { data: taken, error: takenErr } = await supabase.from('blog_posts').select('id').eq('slug', next).neq('id', postId).limit(1);
  if (takenErr) throw new Error(`Slug check failed: ${takenErr.message}`);
  if (taken?.length) {
    return { ok: false, error: `slug "${next}" is already used by another blog post.`, code: 'ALREADY_EXISTS', retryable: false,
      hint: 'Choose another new_slug — or, to retire the other post, unpublish it and point its address here with manage_redirect.' };
  }
  const { data: overlay, error: overlayErr } = await supabase.from('content_translations').select('entity_id, locale')
    .eq('entity', 'blog_post').eq('slug', next).neq('entity_id', postId).limit(1);
  if (overlayErr) throw new Error(`Slug check failed on translations: ${overlayErr.message}`);
  if (overlay?.length) {
    return { ok: false, error: `slug "${next}" is the ${overlay[0].locale} address of another blog post.`, code: 'ALREADY_EXISTS', retryable: false,
      hint: 'Choose another new_slug.' };
  }
  return { ok: true, slug: next, unchanged: false };
}

export interface RenameRedirect {
  from: string;
  to: string;
  status_code: 301;
  /** Earlier redirects into the old address, now pointing straight at the new one. */
  repointed: number;
  /** Languages whose overlay slug was the old slug and moved with it. */
  overlay_slugs_moved: string[];
}

export async function redirectRenamedPost(supabase: Db, postId: string, oldSlug: string, newSlug: string): Promise<RenameRedirect> {
  const from = blogRedirectPath(oldSlug);
  const to = blogRedirectPath(newSlug);

  // The post answers at the new address now: a redirect away from it would
  // never fire, and it would trip manage_redirect's loop guard on a rename back.
  const { error: dropErr } = await supabase.from('page_redirects').delete().eq('from_path', to);
  if (dropErr) throw new Error(`dropping the redirect from /${to} failed: ${dropErr.message}`);

  // a → old, old → new would be a chain; a → new is one hop.
  const { data: repointed, error: repointErr } = await supabase.from('page_redirects')
    .update({ to_path: to, updated_at: new Date().toISOString() }).eq('to_path', from).select('id');
  if (repointErr) throw new Error(`re-pointing redirects into /${from} failed: ${repointErr.message}`);

  const { data: created, error: createErr } = await supabase.rpc('manage_redirect', {
    p_action: 'create', p_from_path: from, p_to_path: to, p_status_code: 301,
    p_note: `Blog post renamed (manage_blog_posts new_slug, post ${postId})`,
  });
  if (createErr) throw new Error(`manage_redirect failed: ${createErr.message}`);
  if (created && (created as { success?: unknown }).success === false) throw new Error(`manage_redirect refused: ${JSON.stringify(created)}`);

  // An overlay slug equal to the old source slug was a copy, not a translated
  // address — it moves. A slug of its own (publish_translation translated_slug) stays.
  const { data: moved, error: moveErr } = await supabase.from('content_translations')
    .update({ slug: newSlug }).eq('entity', 'blog_post').eq('entity_id', postId).eq('slug', oldSlug).select('locale');
  if (moveErr) throw new Error(`moving translation slugs failed: ${moveErr.message}`);

  return {
    from: `/${from}`, to: `/${to}`, status_code: 301,
    repointed: Array.isArray(repointed) ? repointed.length : 0,
    overlay_slugs_moved: Array.isArray(moved) ? moved.map((r: { locale: string }) => r.locale) : [],
  };
}
