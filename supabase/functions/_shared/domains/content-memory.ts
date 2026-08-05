/**
 * Content Memory — what this site has already published.
 *
 * A generative content objective without memory degenerates: the operator is
 * handed the same topic every cycle, has no idea it already answered it, and
 * re-words yesterday's article. flowwink.com published 16 near-identical posts
 * about "MCP + open source AI agents + BOS" between 8 Jun and 23 Jul 2026, two
 * a day at 00:00 and 12:00 UTC — a cron automation carrying a static topic.
 *
 * The first fix (fb223b553, 12 Jul) inlined recent titles into the *heartbeat*
 * prompt only. Duplicates kept landing for another 11 days, because the failing
 * path was automation-dispatcher → agent-execute → ai-task, which never sees
 * the heartbeat's prompt. Content memory is a platform primitive with several
 * consumers, so it lives here — not inside whichever consumer noticed first.
 * (Same reasoning as the Skill Relevance Engine in _shared/skills/.)
 *
 * Consumers:
 *   1. flowpilot-heartbeat — site stats block, every autonomous wake
 *   2. ai-task content_research / content_proposal / seo_content_brief — the
 *      cron/automation path, via each task's `load` hook
 */

export interface ContentMemoryItem {
  title: string;
  status?: string | null;
  published_at?: string | null;
  created_at?: string | null;
}

/** Titles are compared on meaning-bearing words only. */
const STOPWORDS = new Set([
  // English
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'for', 'from', 'how',
  'in', 'is', 'it', 'of', 'on', 'or', 'the', 'to', 'we', 'what', 'why', 'with',
  'your', 'you', 'that', 'this', 'these', 'those', 'into', 'are', 'key',
  // Swedish
  'och', 'att', 'det', 'som', 'en', 'ett', 'är', 'för', 'med', 'på', 'av',
  'till', 'den', 'de', 'om', 'så', 'hur', 'varför', 'vad', 'i', 'du', 'vi',
  'ar', 'for', 'pa', 'sa', 'varfor',
]);

/** Fold case and diacritics so "Öppna vikter" and "oppna vikter" compare equal. */
export function normalizeTitle(title: string): string {
  return String(title || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(title: string): Set<string> {
  return new Set(
    normalizeTitle(title)
      .split(' ')
      .filter((w) => w.length > 2 && !STOPWORDS.has(w)),
  );
}

/**
 * How much of the shorter title's substance already appears in the other, 0..1
 * (containment / overlap coefficient over meaning-bearing words).
 *
 * Deliberately a bag-of-words measure, not an embedding: it must run inline in
 * a prompt-building path with no model call, and the failure mode it catches is
 * re-wording — which preserves the noun phrases almost perfectly.
 *
 * Containment rather than Jaccard because the real duplicates vary in length —
 * "AI Agents och BOS: Varför MCP och Öppna Vikters Modeller Är Framtiden" vs
 * "Framtidens BOS: Varför AI-agenter, Open Source och Öppna Vikters MCP leder
 * Vägen" is Jaccard 0.40 (below any threshold that clears the false positives)
 * but containment 0.67, against a worst false positive of 0.17.
 *
 * Stub titles (under three meaning-bearing words) fall back to Jaccard, since
 * a two-word title is trivially contained in almost anything.
 */
export function titleSimilarity(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  const smaller = Math.min(ta.size, tb.size);
  if (smaller < 3) return shared / (ta.size + tb.size - shared);
  return shared / smaller;
}

/** Existing items whose title is at least `threshold` similar, most similar first. */
export function findSimilarTitles(
  candidate: string,
  existing: ContentMemoryItem[],
  threshold = 0.6,
): Array<{ item: ContentMemoryItem; similarity: number }> {
  return (existing || [])
    .map((item) => ({ item, similarity: titleSimilarity(candidate, item.title) }))
    .filter((m) => m.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity);
}

/** Newest blog output first — drafts included, since a queued draft is coverage too. */
export async function loadRecentContent(
  supabase: any,
  opts: { limit?: number } = {},
): Promise<ContentMemoryItem[]> {
  const limit = opts.limit ?? 10;
  try {
    const { data } = await supabase
      .from('blog_posts')
      .select('title, status, published_at, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);
    return (data || []).filter((p: ContentMemoryItem) => !!p?.title);
  } catch {
    return [];
  }
}

/**
 * The prompt block. Empty string when there is nothing to remember, so callers
 * can concatenate unconditionally.
 */
export function formatContentMemory(items: ContentMemoryItem[]): string {
  if (!items?.length) return '';
  const lines = items
    .map((p) => `  - ${String(p.title || '').slice(0, 100)}`)
    .join('\n');
  return `\n\nALREADY PUBLISHED (newest first) — this site has covered these. New content MUST take a materially different angle, audience, format or sub-topic; never re-word one of these, and never re-publish the same argument in another language:\n${lines}`;
}

/** Load + format in one step, for callers that just want the prompt block. */
export async function loadContentMemoryBlock(
  supabase: any,
  opts: { limit?: number } = {},
): Promise<string> {
  return formatContentMemory(await loadRecentContent(supabase, opts));
}
