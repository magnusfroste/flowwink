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
    if (i < KNOWLEDGE_WHOLE_HITS || h.content.length <= KNOWLEDGE_PREVIEW_CHARS) return h;
    cut += 1;
    return { ...h, content: `${h.content.slice(0, KNOWLEDGE_PREVIEW_CHARS).trimEnd()}…`, cut: true as const };
  });
  return cut
    ? { results, note: `The ${KNOWLEDGE_WHOLE_HITS} best hits are whole; ${cut} more are previews (cut: true). All of them whole: full: true — or ask a narrower question.` }
    : { results };
}
