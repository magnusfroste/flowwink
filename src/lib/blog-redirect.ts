import { blogPostPath } from '@/lib/language-path';

export interface RedirectHit {
  found: boolean;
  to_path?: string;
  external?: boolean;
}

/** `resolve_redirect(p_path)` — injected so the rule is testable without a database. */
export type ResolveRedirect = (path: string) => Promise<RedirectHit | null>;

/**
 * Where a blog address that answers nothing should go, or null (a real 404).
 *
 * `/blog/<slug>` used to be a hard 404 once a post was renamed, drafted or
 * deleted: only PublicPage consulted `page_redirects`. The post page asks the
 * same RPC on not-found. A renamed post has ONE row, `blog/<old>` →
 * `blog/<new>` (manage_blog_posts new_slug); `/<lang>/blog/<old>` tries its
 * own address first (an operator's redirect wins), then the site-language row,
 * and keeps its language: `/sv/blog/<old>` → `/sv/blog/<new>`, where the post
 * page serves the overlay or sends on to the post's own address (§9).
 */
export async function resolveBlogRedirect(
  resolve: ResolveRedirect,
  slug: string,
  lang: string,
  defaultLanguage: string,
): Promise<{ to: string; external: boolean } | null> {
  const own = blogPostPath(slug, lang, defaultLanguage);
  const direct = await resolve(own);
  if (direct?.found && direct.to_path) return { to: direct.to_path, external: direct.external === true };

  const site = blogPostPath(slug, defaultLanguage, defaultLanguage);
  if (site === own) return null;
  const viaSite = await resolve(site);
  if (!viaSite?.found || !viaSite.to_path) return null;
  if (viaSite.external) return { to: viaSite.to_path, external: true };
  const moved = viaSite.to_path.match(/^\/blog\/([^/]+)\/?$/);
  return { to: moved ? blogPostPath(moved[1], lang, defaultLanguage) : viaSite.to_path, external: false };
}
