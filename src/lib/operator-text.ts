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
 */
export function operatorText(
  own: string | null | undefined,
  packText: string,
  currentLocale: string | null | undefined,
  siteLanguage: string,
): string {
  const inSiteLanguage = !currentLocale
    || baseSubtag(currentLocale) === baseSubtag(siteLanguage);
  if (!inSiteLanguage) return packText;
  const chosen = String(own ?? '').trim();
  return chosen || packText;
}

/**
 * `operatorText` for a LIST: the operator's own suggested prompts win on the
 * site's own language, the pack's prompts on every other. One rule, three
 * chat surfaces (widget, block, launcher) — the launcher reading settings
 * directly is how Swedish quick actions reached an English page.
 */
export function operatorPrompts(
  own: ReadonlyArray<string | null | undefined> | null | undefined,
  packPrompts: string[],
  currentLocale: string | null | undefined,
  siteLanguage: string,
): string[] {
  const cleanPack = packPrompts.filter((p) => p.trim() !== '');
  const inSiteLanguage = !currentLocale
    || baseSubtag(currentLocale) === baseSubtag(siteLanguage);
  if (!inSiteLanguage) return cleanPack;
  const cleanOwn = (own ?? []).filter((p): p is string => !!p?.trim());
  return cleanOwn.length ? cleanOwn : cleanPack;
}
