/**
 * A blog post in language L — what every blog reader shows.
 *
 *   the post's own language          → the post, as written
 *   a PUBLISHED overlay in L          → the post with the overlay's text; a
 *                                       unit the overlay lacks keeps the
 *                                       source text (visible, counted)
 *   neither                           → absent in L (null)
 *
 * One function for the archive, the post page, LatestPostsBlock, content-api
 * and RSS, so "is this post in Swedish?" has one answer.
 *
 * Design: docs/architecture/page-translations.md §9.
 */
import { resolveContentInLocale, type OverlayRow } from './resolve-page.ts';
import type { PostLike } from './translation-units.ts';

export interface PostRowLike extends PostLike {
  id: string;
  slug: string;
  locale?: string | null;
}

export interface PostInLanguage<T> {
  /** The post with L's text in place — same keys, same shape. */
  post: T;
  /** The slug in L: the overlay's own, or the post's. */
  slug: string;
  locale: string;
  source: 'post' | 'overlay';
  coverage: number;
  fallback_units: string[];
  stale_units: string[];
}

function baseSubtag(tag: string | null | undefined): string {
  return String(tag ?? '').trim().toLowerCase().split('-')[0];
}

export function postInLanguage<T extends PostRowLike>(
  post: T,
  lang: string,
  overlay: OverlayRow | null | undefined,
  defaultLanguage: string,
): PostInLanguage<T> | null {
  const want = String(lang ?? '').trim().toLowerCase();
  const own = String(post.locale ?? defaultLanguage ?? '').trim().toLowerCase();
  if (!want || baseSubtag(own) === baseSubtag(want)) {
    return { post, slug: post.slug, locale: own || want, source: 'post', coverage: 100, fallback_units: [], stale_units: [] };
  }
  if (!overlay || (overlay.status && overlay.status !== 'published')) return null;
  const r = resolveContentInLocale('blog_post', post, overlay);
  return {
    post: r.page,
    slug: String(overlay.slug ?? '').trim() || post.slug,
    locale: overlay.locale,
    source: 'overlay',
    coverage: r.coverage,
    fallback_units: r.fallback_units,
    stale_units: r.stale_units,
  };
}

/** A list in L: posts absent in L dropped, the rest with L's text. Order kept. */
export function postsInLanguage<T extends PostRowLike>(
  posts: T[],
  lang: string,
  overlays: Array<OverlayRow & { entity_id: string }>,
  defaultLanguage: string,
): Array<PostInLanguage<T>> {
  const want = String(lang ?? '').trim().toLowerCase();
  const byPost = new Map<string, OverlayRow>();
  for (const o of overlays ?? []) {
    if (String(o.locale).toLowerCase() === want || (!byPost.has(o.entity_id) && baseSubtag(o.locale) === baseSubtag(want))) {
      byPost.set(o.entity_id, o);
    }
  }
  const out: Array<PostInLanguage<T>> = [];
  for (const p of posts ?? []) {
    const r = postInLanguage(p, want, byPost.get(p.id), defaultLanguage);
    if (r) out.push(r);
  }
  return out;
}
