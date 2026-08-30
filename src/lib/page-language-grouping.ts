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

  const want = String(workingLang || '').toLowerCase();
  const picked = [...groups.values()].map((siblings) => {
    const code = (p: T) => String(p.locale ?? '').toLowerCase();
    return (
      siblings.find((p) => code(p) === want)
      // 'en-GB' should answer a request for 'en' rather than showing nothing.
      ?? siblings.find((p) => code(p).split('-')[0] === want.split('-')[0])
      // No version in this language yet. The group still appears — hiding it
      // would look exactly like the page having been deleted.
      ?? siblings[0]
    );
  });

  return [...loose, ...picked];
}
