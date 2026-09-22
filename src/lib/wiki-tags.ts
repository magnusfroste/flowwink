/**
 * Wiki tags — the grouping the left column reads.
 *
 * The rule lives in the database (wiki_pages_collect_tags: normalise the
 * field, collect every #tag written in the body). This file mirrors the two
 * pieces the browser needs before a round trip: which tags a body carries
 * (so the editor can show them as "written in the page", not removable), and
 * how the page list folds into groups. The guard wiki-tags-group-not-tree
 * keeps the inline-tag rule here and in SQL agreeing on the same fixtures.
 */

/** A #tag after a line start, whitespace or "(" — a heading ("# Title") has a space, an anchor (page.html#x) has none. */
const INLINE_TAG_RE = /(?:^|[\s(])#(\p{L}[\p{L}\p{N}_-]*)/gu;
const COLOUR_CODE_RE = /^[0-9a-f]{3}(?:[0-9a-f]{3})?$/i;

export function inlineTags(content: string): string[] {
  const found = new Set<string>();
  for (const m of (content ?? '').matchAll(INLINE_TAG_RE)) {
    const tag = m[1].toLowerCase();
    if (!COLOUR_CODE_RE.test(tag)) found.add(tag);
  }
  return [...found].sort();
}

export function normalizeTag(raw: string): string {
  return raw.trim().replace(/^#+/, '').toLowerCase().slice(0, 40);
}

/** all_tags is what the page bears (field ∪ #tags in the body) — the database computes it. */
export type TaggedPage = { slug: string; title: string; all_tags: string[]; updated_at: string };

export type TagGroup<P extends TaggedPage> = { tag: string | null; label: string; pages: P[] };

export const UNTAGGED_LABEL = 'Untagged';

/**
 * Fold pages into groups, one per tag; a page with two tags appears twice —
 * that is the point of a label over a folder. Groups: most pages first, then
 * by name; inside a group newest first, so "Tisdagsmöte v39, v38, v37" reads
 * as a series. Pages with no tag close the list under "Untagged", so what
 * still needs a label is visible rather than lost at the root.
 */
export function groupByTag<P extends TaggedPage>(pages: P[], only?: string | null): TagGroup<P>[] {
  const byTag = new Map<string, P[]>();
  const untagged: P[] = [];
  for (const p of pages) {
    if (!p.all_tags?.length) { untagged.push(p); continue; }
    for (const t of p.all_tags) {
      if (!byTag.has(t)) byTag.set(t, []);
      byTag.get(t)!.push(p);
    }
  }
  const newestFirst = (a: P, b: P) => b.updated_at.localeCompare(a.updated_at);
  const groups: TagGroup<P>[] = [...byTag.entries()]
    .filter(([t]) => !only || t === only)
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .map(([tag, list]) => ({ tag, label: tag, pages: [...list].sort(newestFirst) }));
  if (!only && untagged.length) groups.push({ tag: null, label: UNTAGGED_LABEL, pages: untagged.sort(newestFirst) });
  return groups;
}

/** Every tag in use, most used first — what the picker offers before inventing a new one. */
export function tagsInUse(pages: TaggedPage[]): { tag: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const p of pages) for (const t of p.all_tags ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}
