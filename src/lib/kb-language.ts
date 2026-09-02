/**
 * Which KB rows a visitor in language L gets to see.
 *
 * Found live on optictunnels.se/en/help (2026-08-31): English chrome around
 * all-Swedish articles and category names — `kb_articles` had no language
 * dimension, so the English help page could not do anything but lie. The rail
 * is the same one pages ride (docs/architecture/language.md §2): a row per
 * language, `locale` + `translation_group_id` on the row, and the shared
 * `pickLocale()` ladder to choose a version.
 *
 * What an ABSENCE means is this module's whole job, and it differs by surface:
 *
 *   - LISTS (hub, accordion, featured): a group with no version in the
 *     visitor's language is honestly absent. Showing the Swedish article on
 *     the English help page is exactly the bug this exists to fix.
 *   - SEARCH: a match in another language may surface, but MARKED — a visitor
 *     searching for a product name deserves the hit, and deserves to know it
 *     answers in another language.
 *   - Rows with NO locale at all predate the rail (an un-migrated instance, or
 *     a cached response from one). They are always kept: hiding the entire KB
 *     because a column has not landed would be a gate, not a fallback (Law 4).
 *
 * Categories are labels, not documents — they translate as an overlay on the
 * row (`translations` jsonb), not as a row per language, because every article
 * version points at ONE category row. A label with no translation falls back
 * VISIBLY to the base name: hiding the category would hide its already
 * translated articles.
 */
import { pickLocale, baseSubtag } from './pick-locale';

export interface LocalizableKbArticle {
  id: string;
  /** Absent on rows written before the language rail — treated as "always shown". */
  locale?: string | null;
  /** Rows sharing it are language versions of each other. */
  translation_group_id?: string | null;
}

/**
 * The list filter: one row per translation group, in the visitor's language.
 *
 * @param wanted the language the page is being read in (null = not declared,
 *   which resolves to the site's own language)
 * @param siteDefault the site's declared default language
 * @param multilingual false on a single-language site, where this must be a
 *   complete no-op — same reference, no reordering, nothing to explain.
 */
export function kbInVisitorLanguage<T extends LocalizableKbArticle>(
  articles: T[],
  wanted: string | null | undefined,
  siteDefault: string,
  multilingual: boolean,
): T[] {
  if (!multilingual) return articles;

  const lang = String(wanted ?? '').trim() || siteDefault;

  // Choose one row per group first, so the pass below can keep original order.
  const groups = new Map<string, T[]>();
  for (const article of articles) {
    if (!article.locale) continue; // pre-rail row — no group to weigh
    const key = article.translation_group_id ?? `solo:${article.id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(article);
  }

  const chosen = new Set<string>();
  for (const siblings of groups.values()) {
    // No `fallback` on purpose: for a LIST, the site default is not a
    // substitute for the visitor's language — that substitution is the lie
    // this module exists to remove. The default only enters as `wanted` when
    // the surface itself declared no language (above).
    const pick = pickLocale({
      available: siblings.map((a) => String(a.locale)),
      wanted: lang,
    });
    if (!pick) continue; // honest absence
    const winner = siblings.find((a) => String(a.locale) === pick);
    if (winner) chosen.add(winner.id);
  }

  return articles.filter((a) => !a.locale || chosen.has(a.id));
}

/**
 * The search split: which matches answer in the visitor's language, and which
 * only exist in another one.
 *
 * @param matches rows matching the query, drawn from the FULL article set
 * @param inLanguageIds ids kept by kbInVisitorLanguage over that same set
 * @returns primary — matches in the visitor's language (render as usual);
 *   fallback — matches whose group has NO in-language version (render marked
 *   with their locale). A group already represented in primary never repeats
 *   in fallback: the visitor found the article, in their language.
 */
export function splitSearchMatchesByLanguage<T extends LocalizableKbArticle>(
  matches: T[],
  inLanguageIds: ReadonlySet<string>,
): { primary: T[]; fallback: T[] } {
  const primary = matches.filter((m) => !m.locale || inLanguageIds.has(m.id));

  const covered = new Set<string>();
  for (const m of primary) {
    if (m.translation_group_id) covered.add(m.translation_group_id);
  }

  const fallback: T[] = [];
  for (const m of matches) {
    if (!m.locale || inLanguageIds.has(m.id)) continue;
    const group = m.translation_group_id;
    if (group) {
      if (covered.has(group)) continue; // the group already answered in-language
      covered.add(group); // one fallback per group is enough
    }
    fallback.push(m);
  }

  return { primary, fallback };
}

export interface LocalizableKbCategory {
  name: string;
  description?: string | null;
  /** {"en": {"name": "Billing", "description": …}} — see the migration comment. */
  translations?: unknown;
}

/**
 * A category's visitor-facing label in language L.
 *
 * Mirrors the operatorText rule (§3): the base columns are what the operator
 * wrote for THEIR OWN language, so they win for the site's language and lose
 * to the overlay on any other. A missing overlay falls back to the base name —
 * visibly wrong-language beats invisibly missing, because hiding the label
 * would hide its translated articles.
 */
export function localizedCategoryText(
  category: LocalizableKbCategory,
  wanted: string | null | undefined,
  siteDefault: string,
): { name: string; description: string | null } {
  const base = { name: category.name, description: category.description ?? null };

  const lang = String(wanted ?? '').trim() || siteDefault;
  if (baseSubtag(lang) === baseSubtag(siteDefault)) return base;

  const overlay = category.translations;
  if (!overlay || typeof overlay !== 'object' || Array.isArray(overlay)) return base;

  const entries = overlay as Record<string, { name?: unknown; description?: unknown }>;
  const pick = pickLocale({ available: Object.keys(entries), wanted: lang });
  if (!pick) return base;

  const entry = entries[pick];
  if (!entry || typeof entry !== 'object') return base;
  return {
    name: typeof entry.name === 'string' && entry.name.trim() ? entry.name : base.name,
    description:
      typeof entry.description === 'string' && entry.description.trim()
        ? entry.description
        : base.description,
  };
}
