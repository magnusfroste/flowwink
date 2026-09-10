import { baseSubtag } from './pick-locale';

/**
 * A string the operator wrote in their own settings, shown in the right language.
 *
 * Several settings hold visitor-facing text that predates the language layer:
 * the blog's archive title, the cookie banner's copy, the maintenance message.
 * Each is ONE value, and each competes with the same two others:
 *
 *   own      the operator's word, from their settings
 *   pack     ui_text — the base layer or a @<locale> overlay
 *   code     the English at the t() call site, already inside `pack`
 *
 * The operator's word is written for THEIR OWN language — exactly the role the
 * flat base layer plays in the ui_text pack. So on a page in another language it
 * must not win, or an English page keeps showing Swedish. That has now been
 * wrong twice: the menu said "Blogg" on English pages, and the cookie banner
 * greeted English visitors in Swedish on every single page.
 *
 * On a page in the site's own language the operator's word beats the pack: they
 * chose it deliberately, and a generic entry should not override that.
 *
 * `codeDefault` is the value the settings hook fills in when the operator has
 * saved nothing — `{ ...defaultBlogSettings, ...stored }` makes the two
 * indistinguishable by the time they reach a component. That default is the
 * product's English, not a choice: on Resta Gård no `blog` row existed, the
 * hook handed the menu `archiveTitle: 'Blog'`, and because it arrived as the
 * operator's own word it beat the Swedish pack that translate_ui_text had
 * filled ("Blogg"). Nobody had chosen "Blog"; the code had. So a value equal
 * to the default counts as absent, and the pack — which carries the same
 * English at the bottom — answers. Pass `null` where no code default can
 * reach `own` (block content, a raw row read without a merge).
 */
export function operatorText(
  own: string | null | undefined,
  packText: string,
  currentLocale: string | null | undefined,
  siteLanguage: string,
  codeDefault: string | null,
): string {
  const inSiteLanguage = !currentLocale
    || baseSubtag(currentLocale) === baseSubtag(siteLanguage);
  if (!inSiteLanguage) return packText;
  const chosen = String(own ?? '').trim();
  if (codeDefault != null && chosen === String(codeDefault).trim()) return packText;
  return chosen || packText;
}

/**
 * `operatorText` for a LIST: the operator's own suggested prompts win on the
 * site's own language, the pack's prompts on every other. One rule, three
 * chat surfaces (widget, block, launcher) — the launcher reading settings
 * directly is how Swedish quick actions reached an English page.
 *
 * `codeDefault` as above: a list identical to the hook's default is the
 * product's English, not the operator's prompts, and yields to the pack.
 */
export function operatorPrompts(
  own: ReadonlyArray<string | null | undefined> | null | undefined,
  packPrompts: string[],
  currentLocale: string | null | undefined,
  siteLanguage: string,
  codeDefault: ReadonlyArray<string> | null,
): string[] {
  const cleanPack = packPrompts.filter((p) => p.trim() !== '');
  const inSiteLanguage = !currentLocale
    || baseSubtag(currentLocale) === baseSubtag(siteLanguage);
  if (!inSiteLanguage) return cleanPack;
  const cleanOwn = (own ?? []).filter((p): p is string => !!p?.trim()).map((p) => p.trim());
  if (codeDefault) {
    const cleanDefault = codeDefault.map((p) => p.trim()).filter(Boolean);
    const sameAsDefault = cleanOwn.length === cleanDefault.length
      && cleanOwn.every((p, i) => p === cleanDefault[i]);
    if (sameAsDefault) return cleanPack;
  }
  return cleanOwn.length ? cleanOwn : cleanPack;
}
