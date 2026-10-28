import { useIsModuleEnabled } from '@/hooks/useModules';
import { useStoreSettings } from '@/hooks/useSiteSettings';
import { productPath } from '@/lib/language-path';

/**
 * Does this site SELL? One reader for the storefront dial.
 *
 * The ecommerce module is more than a webshop — its catalog feeds quotes,
 * contracts and the chat — so a B2B site runs it with `store.storefront: false`.
 * The dial used to hide only the header's cart icon: /shop still printed a
 * price on every product and an Add button, so a waterjet with no public price
 * would have sold for 0 kr (MJP, 2026-09-28).
 *
 * - `selling`: prices, cart buttons, cart and checkout are live. True while
 *   the settings load, so a shop never flickers into a catalog.
 * - `catalogOnly`: known to be off. Products show as a catalog — name, image,
 *   description, "ask about this product" — never a price or a cart action.
 */
export function useStorefront(): { selling: boolean; catalogOnly: boolean } {
  const ecommerceEnabled = useIsModuleEnabled('ecommerce');
  const { data, isLoading } = useStoreSettings();
  const catalogOnly = !isLoading && data?.storefront === false;
  return { selling: ecommerceEnabled && !catalogOnly, catalogOnly };
}

/**
 * The one address of a product page: /shop/<id> in the site language,
 * /<lang>/shop/<id> in another (page-translations.md §10). Without a language
 * it is the site-language address, as before.
 */
export const productHref = (id: string, lang?: string | null, defaultLanguage?: string) =>
  lang && defaultLanguage ? productPath(id, lang, defaultLanguage) : `/shop/${id}`;
