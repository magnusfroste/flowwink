// "Did you mean …?" for an address that names nothing (2026-11-21).
//
// On www FlowPilot asked to update the post
// "the-workflow-reliability-layer-for-ai-automation" fifteen times in a week.
// The post is "the-workflow-reliability-layer-how-small-teams-prevent-silent-
// automation-drift"; the answer was "no blog post with slug …", which gave the
// next run nothing to do but try again. A miss now names the nearest posts.
// It never ACTS on a guess: the caller repeats the call with the real slug.

export interface SlugCandidate {
  slug: string;
  title?: string | null;
  id?: string | null;
  status?: string | null;
}

/** Below this share of the sent slug's words, a post is not offered. */
export const SLUG_NEARNESS_MIN = 0.5;

const words = (s: string): string[] =>
  [...new Set(String(s ?? '').toLowerCase().split(/[^a-z0-9åäöüéèø]+/).filter((w) => w.length >= 3))];

/** The share of the sent slug's words a candidate carries (0–1). */
export function slugNearness(sent: string, candidate: string): number {
  const a = words(sent);
  if (!a.length) return 0;
  const b = new Set(words(candidate));
  const shared = a.filter((w) => b.has(w)).length;
  // One shared word is a coincidence ("the", a year): two at least.
  return shared >= 2 || (a.length === 1 && shared === 1) ? shared / a.length : 0;
}

export function nearestSlugs<T extends SlugCandidate>(sent: string, candidates: readonly T[], max = 3): T[] {
  return candidates
    .map((c) => ({ c, score: Math.max(slugNearness(sent, c.slug), slugNearness(sent, String(c.title ?? ''))) }))
    .filter((x) => x.score >= SLUG_NEARNESS_MIN && x.c.slug !== sent)
    .sort((x, y) => y.score - x.score || x.c.slug.length - y.c.slug.length || x.c.slug.localeCompare(y.c.slug))
    .slice(0, max)
    .map((x) => x.c);
}

/** The sentence a miss ends with; '' when nothing is near. */
export function didYouMeanSlugs(near: readonly SlugCandidate[]): string {
  if (!near.length) return '';
  return ` Did you mean ${near.map((n) => `"${n.slug}"`).join(' or ')}?`;
}
