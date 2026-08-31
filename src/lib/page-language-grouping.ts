/**
 * One row per page in the admin list, in the language being worked in.
 *
 * A page per language is the right storage model — it is what gives each
 * language its own URL. But it made Optic's admin list grow from twelve rows
 * to nineteen, and a third language would have made it thirty-six. That is the
 * storage model leaking into a surface it has no business being in.
 *
 * A translation group is ONE page to the person editing. This picks which of
 * its rows to show.
 */
import { pickLocale } from './pick-locale';

export interface GroupablePage {
  locale?: string | null;
  translation_group_id?: string | null;
}

/**
 * @param pages every page the editor may see
 * @param workingLang the language being worked in, e.g. 'sv'
 * @param multilingual false on a single-language site, where grouping must be
 *   a complete no-op — no reordering, no filtering, nothing to explain.
 */
export function pagesInWorkingLanguage<T extends GroupablePage>(
  pages: T[],
  workingLang: string,
  multilingual: boolean,
): T[] {
  if (!multilingual) return pages;

  const groups = new Map<string, T[]>();
  const loose: T[] = [];
  for (const page of pages) {
    const group = page.translation_group_id;
    if (!group) { loose.push(page); continue; }
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group)!.push(page);
  }

  const picked = [...groups.values()].map((siblings) => {
    // The ladder itself lives in one place; this only decides what an ABSENCE
    // means here. A group with no version in the working language still
    // appears, as whatever exists — hiding it would look exactly like the page
    // having been deleted.
    const chosen = pickLocale({
      available: siblings.map((p) => String(p.locale ?? '')),
      wanted: workingLang,
    });
    if (!chosen) return siblings[0];
    return siblings.find((p) => String(p.locale ?? '') === chosen) ?? siblings[0];
  });

  return [...loose, ...picked];
}


/**
 * Which language versions of a page have fallen behind.
 *
 * A page per language stores the truth but hides the drift: an operator who
 * improves the Swedish services page gets no signal that the English sibling
 * is now stale. No ratchet catches that — it is a process gap, not a code
 * bug — so the admin list says it out loud instead.
 *
 * "Behind" means: this sibling was last touched more than `thresholdMs` before
 * the freshest version in the group. The threshold exists because batch
 * operations (backfills, realignments) touch every row within seconds of each
 * other, and flagging those as drift would teach people to ignore the chip.
 */
export interface DriftablePage extends GroupablePage {
  updated_at?: string | null;
}

export function staleSiblings<T extends DriftablePage>(
  row: T,
  siblings: T[],
  thresholdMs = 24 * 60 * 60 * 1000,
): Array<{ locale: string; daysBehind: number }> {
  if (!row.translation_group_id || !row.updated_at) return [];
  const rowTime = Date.parse(row.updated_at);
  if (Number.isNaN(rowTime)) return [];

  const out: Array<{ locale: string; daysBehind: number }> = [];
  for (const sibling of siblings) {
    if (sibling === row) continue;
    if (sibling.translation_group_id !== row.translation_group_id) continue;
    if (!sibling.locale || !sibling.updated_at) continue;
    const siblingTime = Date.parse(sibling.updated_at);
    if (Number.isNaN(siblingTime)) continue;
    const gap = rowTime - siblingTime;
    if (gap > thresholdMs) {
      out.push({
        locale: String(sibling.locale),
        daysBehind: Math.floor(gap / (24 * 60 * 60 * 1000)),
      });
    }
  }
  return out.sort((a, b) => b.daysBehind - a.daysBehind);
}
