// A read answers what the question needs — not everything it has (2026-11-22).
//
// www's morning heartbeat asks two things in its first step: every published
// post (`browse_blog limit: 50` — 34 rows, each with an image address and an
// excerpt, 21 000 characters) and the knowledge on a topic (`search_knowledge
// limit: 20` — eleven chunks of 2 500 characters, 26 000). Together 27 000
// tokens, carried on every later step of a four-step run; folding
// (fold-tool-results.ts) only reaches an answer once it is two turns old.
//
// Two rules, pure:
//   • a LONG list of posts is titles — slug, title, date. The excerpt and the
//     image belong to a short list (what a visitor is shown) or to `full`.
//   • a knowledge search returns its best hits whole and the rest as a
//     preview: the ranking already says which ones matter.

export const BLOG_LIST_WHOLE_UP_TO = 10;
export const KNOWLEDGE_WHOLE_HITS = 3;
export const KNOWLEDGE_PREVIEW_CHARS = 400;
// A "whole" hit is one chunk's worth (2026-11-26). A knowledge-base or wiki
// chunk is at most ~2 500 characters, but a PAGE hit carried the page's whole
// text: on www three page hits of 4–6 000 characters made one search 17 000
// characters. The best hits keep their first 2 500, marked like the rest.
export const KNOWLEDGE_BEST_HIT_MAX_CHARS = 2500;

type Row = Record<string, unknown>;

export function shapeBlogList(posts: Row[], opts: { full?: boolean } = {}): { posts: Row[]; compact?: true; note?: string } {
  if (opts.full || posts.length <= BLOG_LIST_WHOLE_UP_TO) return { posts };
  return {
    posts: posts.map((p) => ({
      slug: p.slug,
      title: p.title,
      published_at: typeof p.published_at === 'string' ? p.published_at.slice(0, 10) : p.published_at,
    })),
    compact: true,
    note: `Over ${BLOG_LIST_WHOLE_UP_TO} posts are listed by slug, title and date. Excerpt and image: a limit of ${BLOG_LIST_WHOLE_UP_TO} or less, or full: true. One post whole: manage_blog_posts get with its slug.`,
  };
}

export function shapeKnowledgeHits<T extends { content: string }>(
  hits: T[],
  opts: { full?: boolean } = {},
): { results: Array<T & { cut?: true }>; note?: string } {
  if (opts.full) return { results: hits };
  let cut = 0;
  const results = hits.map((h, i) => {
    const keep = i < KNOWLEDGE_WHOLE_HITS ? KNOWLEDGE_BEST_HIT_MAX_CHARS : KNOWLEDGE_PREVIEW_CHARS;
    if (h.content.length <= keep) return h;
    cut += 1;
    return { ...h, content: `${h.content.slice(0, keep).trimEnd()}…`, cut: true as const };
  });
  return cut
    ? { results, note: `The ${KNOWLEDGE_WHOLE_HITS} best hits keep up to ${KNOWLEDGE_BEST_HIT_MAX_CHARS} characters, the rest are previews; ${cut} were cut (cut: true). All of them whole: full: true — or ask a narrower question.` }
    : { results };
}

/**
 * audit_blog's post list (2026-11-26): the posts that have a finding, with
 * their measures; the rest are counted. A post is named by slug in a finding.
 */
export function auditPostList<P extends { slug: string }>(
  posts: P[],
  findings: ReadonlyArray<{ slug: string }>,
  full: boolean,
): { posts: P[]; clean_posts?: number; note?: string } {
  if (full) return { posts };
  const flagged = new Set(findings.map((f) => f.slug));
  const listed = posts.filter((p) => flagged.has(p.slug));
  const clean = posts.length - listed.length;
  return clean > 0
    ? { posts: listed, clean_posts: clean, note: `${clean} post(s) with no finding are counted, not listed. Every post with its measures: full: true.` }
    : { posts: listed };
}

/**
 * manage_blog_posts list (2026-11-27): the admin's listing keeps id and status,
 * and over BLOG_LIST_WHOLE_UP_TO posts it drops the excerpt and the image
 * address, as browse_blog does. `full: true` keeps them; `get` is one post whole.
 */
export function shapeAdminBlogList(posts: Row[], opts: { full?: boolean } = {}): { posts: Row[]; compact?: true; note?: string } {
  if (opts.full || posts.length <= BLOG_LIST_WHOLE_UP_TO) return { posts };
  const day = (v: unknown) => (typeof v === 'string' ? v.slice(0, 10) : v);
  return {
    posts: posts.map((p) => ({ id: p.id, slug: p.slug, title: p.title, status: p.status, published_at: day(p.published_at), updated_at: day(p.updated_at) })),
    compact: true,
    note: `Over ${BLOG_LIST_WHOLE_UP_TO} posts are listed by id, slug, title, status and dates. Excerpt and image: a limit of ${BLOG_LIST_WHOLE_UP_TO} or less, or full: true. One post whole: action get with its slug.`,
  };
}
