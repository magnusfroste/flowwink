/**
 * Which language a page's block CONTENT is written in, for the blocks that
 * choose between their own text and the visitor-text pack.
 *
 * operatorText answers "whose words?" for a SETTING: an operator's setting is
 * written in the site's language, so on a page in another language the pack
 * wins. Block fields are not settings: they belong to the page, and the page
 * is in its own language — a translated row, or an overlay that put the
 * English words in. Run through operatorText, optic's English contact form
 * (2026-10-25) showed the pack's "Send message" instead of Svante's "Send",
 * before and after its conversion to an overlay.
 *
 * So the public page states the language its content is in and which units
 * still show the SOURCE text (get-page's language.fallback_units). A field is
 * the page's own words — shown as written — unless it is one of those
 * fallbacks, where the pack in the visitor's language beats a word in the
 * wrong language. Outside a public page (the editor, a preview) there is no
 * provider and the old rule applies unchanged.
 */
import { createContext, useCallback, useContext } from 'react';
import { operatorText } from '@/lib/operator-text';
import { useUiTextLanguage } from '@/lib/ui-text';

export interface PageContentLanguage {
  /** The language the page's blocks are written in (the served locale). */
  lang: string | null;
  /** Unit keys (`<blockId>.data.<path>`) that still carry the source text. */
  fallbackUnits: Set<string>;
}

export const PageContentLanguageContext = createContext<PageContentLanguage | null>(null);

/** Pure decision, exported for tests. */
export function pickBlockText(
  own: string | null | undefined,
  packText: string,
  unit: string,
  page: PageContentLanguage | null,
  visitorLang: string | null | undefined,
  siteLang: string,
): string {
  if (!page) return operatorText(own, packText, visitorLang, siteLang, null);
  const chosen = String(own ?? '').trim();
  if (!chosen) return packText;
  return page.fallbackUnits.has(unit) ? packText : chosen;
}

/** `(path, own, pack)` → the text a block field shows. `path` is relative to the block's data, e.g. `submitButtonText` or `fields[2].placeholder`. */
export function useBlockText(blockId: string | undefined) {
  const page = useContext(PageContentLanguageContext);
  const { lang, siteLang } = useUiTextLanguage();
  return useCallback(
    (path: string, own: string | null | undefined, packText: string) =>
      pickBlockText(own, packText, `${blockId ?? ''}.data.${path}`, page, lang, siteLang),
    [blockId, page, lang, siteLang],
  );
}
