import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useSiteLanguages } from '@/hooks/useSiteSettings';
import { useSetUiTextLang } from '@/lib/ui-text';
import { blogIndexPath, blogPostPath, isSiteLanguage } from '@/lib/language-path';

/**
 * The language a blog page is shown in, read off its address.
 *
 * `/blog/...` is the site's own language; `/<lang>/blog/...` is another
 * DECLARED language. A prefix that is not a declared language (or is the
 * site's own — that address is /blog) is not a blog address: `valid` is false
 * and the page answers 404, as an unknown two-segment path always has.
 *
 * Also declares the language to the chrome (ui_text), so a Swedish post is
 * wrapped in Swedish buttons — the same thing PublicPage does for a page.
 *
 * Design: docs/architecture/page-translations.md §9.
 */
export function useBlogLanguage() {
  const { lang: langParam } = useParams<{ lang?: string }>();
  const { defaultLanguage, languages, isMultilingual, isLoading: languagesLoading } = useSiteLanguages();
  const param = langParam?.toLowerCase() ?? null;
  // While the declared languages load, a prefix is given the benefit of the
  // doubt: judging it against the ['en'] fallback 404'd a cold /sv/blog/x
  // (English 404, noindex) before the real list arrived.
  const valid = param === null || languagesLoading || (languages.includes(param) && !isSiteLanguage(param, defaultLanguage));
  const lang = param ?? defaultLanguage;

  const setUiTextLang = useSetUiTextLang();
  // Released on leave, or /shop after /en/blog kept English chrome.
  useEffect(() => {
    setUiTextLang(param);
    return () => setUiTextLang(null);
  }, [param, setUiTextLang]);

  return {
    /** The language shown. */
    lang,
    valid,
    defaultLanguage,
    isMultilingual,
    /** The language to filter and translate lists by — null on a one-language site (show everything, as before). */
    listLanguage: isMultilingual ? lang : null,
    indexPath: (tail = '') => blogIndexPath(lang, defaultLanguage, tail),
    postPath: (slug: string) => blogPostPath(slug, lang, defaultLanguage),
  };
}
