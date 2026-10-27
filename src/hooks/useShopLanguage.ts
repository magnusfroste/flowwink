import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useSiteLanguages } from '@/hooks/useSiteSettings';
import { useSetUiTextLang } from '@/lib/ui-text';
import { isSiteLanguage, productPath, shopIndexPath, shopVersions } from '@/lib/language-path';

/**
 * The language the shop is shown in, read off its address — the blog rule
 * (useBlogLanguage) applied to /shop and /<lang>/shop (page-translations.md
 * §10). Every enabled language has the shop: a product without a translation
 * is shown in its source language, never hidden.
 */
export function useShopLanguage() {
  const { lang: langParam } = useParams<{ lang?: string }>();
  const { defaultLanguage, languages, isMultilingual, isLoading: languagesLoading } = useSiteLanguages();
  const param = langParam?.toLowerCase() ?? null;
  const valid = param === null || languagesLoading || (languages.includes(param) && !isSiteLanguage(param, defaultLanguage));
  const lang = param ?? defaultLanguage;

  const setUiTextLang = useSetUiTextLang();
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
    /** The language to translate lists into — null on a one-language site (as written). */
    listLanguage: isMultilingual ? lang : null,
    indexPath: (tail = '') => shopIndexPath(lang, defaultLanguage, tail),
    productPath: (id: string) => productPath(id, lang, defaultLanguage),
    /** Every language's address for the shop index, or for one product. */
    versions: (productId?: string) =>
      shopVersions(languages, defaultLanguage, (l) => (productId ? productPath(productId, l, defaultLanguage) : shopIndexPath(l, defaultLanguage))),
  };
}
