import { baseSubtag } from './pick-locale';

/**
 * What the blog link in the menu says.
 *
 * Three values compete, and the order has been wrong twice:
 *
 *   archiveTitle   the operator's own word, from blog settings
 *   packLabel      ui_text — the base layer or a @<locale> overlay
 *   'Blog'         the English in the code, carried by the t() call site
 *
 * `archiveTitle` is the operator's word for THEIR OWN language — exactly the
 * role the flat base layer plays in the ui_text pack. So on a page in another
 * language it must not win, or an English menu keeps saying "Blogg" (which is
 * what happened: the code's fallback was the Swedish string, and no live site
 * had ever set the value).
 *
 * On a page in the site's own language the operator's word beats the pack: they
 * named their blog, and a generic entry should not override that.
 */
export function blogLinkLabel(
  archiveTitle: string | null | undefined,
  packLabel: string,
  currentLocale: string | null | undefined,
  siteLanguage: string,
): string {
  const inSiteLanguage = !currentLocale
    || baseSubtag(currentLocale) === baseSubtag(siteLanguage);
  if (!inSiteLanguage) return packLabel;
  const own = String(archiveTitle ?? '').trim();
  return own || packLabel;
}
