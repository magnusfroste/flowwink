/**
 * Which numbered sources an answer actually cites.
 *
 * Flowwork numbers EVERYTHING it retrieved ([1]…[48]) so the model can cite
 * any of it; the answer then cites a few — "[19–23]". Showing all 48 as
 * "cited" made a five-source answer look like it rested on the whole
 * workspace (2026-10-31). Reads [3], [3, 5], [3][5], [19–23] and [19-23].
 */
export function citedRefs(text: string): Set<number> {
  const out = new Set<number>();
  for (const m of text.matchAll(/\[(\d+(?:\s*[-–—]\s*\d+)?(?:\s*,\s*\d+(?:\s*[-–—]\s*\d+)?)*)\]/g)) {
    for (const part of m[1].split(',')) {
      const [a, b] = part.split(/[-–—]/).map((x) => parseInt(x.trim(), 10));
      if (Number.isNaN(a)) continue;
      const hi = Number.isNaN(b) || b === undefined ? a : b;
      // Not a citation: a year span or a price band — refs are small numbers
      // and a range is a handful of them.
      if (hi < a || hi - a > 50 || hi > 500) continue;
      for (let n = a; n <= hi; n++) out.add(n);
    }
  }
  return out;
}
