/**
 * The visitor texts and the language they are written in, read on the server —
 * so a document the customer gets (the invoice PDF) uses the words the site
 * shows them. Same reads as UiTextProvider: `ui_text`, and the DECLARED site
 * language (`site_languages.default`, then `platform_locale.default_locale`).
 * A failed read is logged and the call-site English carries the document —
 * never thrown: a label is not worth a lost PDF.
 */
import type { UiTextMap } from './ui-text.ts';

interface Reader {
  from(table: string): {
    select(cols: string): {
      in(col: string, values: readonly string[]): PromiseLike<{ data: Array<{ key: string; value: unknown }> | null; error: { message: string } | null }>;
    };
  };
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

export async function loadUiText(supabase: unknown): Promise<{ map: UiTextMap; siteLang: string }> {
  const { data, error } = await (supabase as Reader)
    .from('site_settings').select('key, value').in('key', ['ui_text', 'site_languages', 'platform_locale']);
  if (error) console.warn('[ui-text] could not read the visitor texts, using English:', error.message);
  const byKey: Record<string, unknown> = {};
  for (const r of data ?? []) byKey[r.key] = r.value;
  const map = (byKey.ui_text && typeof byKey.ui_text === 'object' ? byKey.ui_text : {}) as UiTextMap;
  const declared = (byKey.site_languages as { default?: string } | undefined)?.default;
  const formatLocale = (byKey.platform_locale as { default_locale?: string } | undefined)?.default_locale;
  return { map, siteLang: String(declared || formatLocale || 'en').toLowerCase() };
}

/**
 * The customer's language for a document: the language they ordered in, else
 * their party's (`partner_language`), else null — the site's own, which the
 * resolver falls to. The same ladder the receipt mail walks.
 */
export async function customerLanguage(
  supabase: unknown,
  who: { orderLang?: string | null; partnerId?: string | null },
): Promise<string | null> {
  if (who.orderLang) return who.orderLang;
  if (!who.partnerId) return null;
  const { data, error } = await (supabase as Reader).rpc('partner_language', { p_partner_id: who.partnerId });
  if (error) console.warn('[ui-text] could not read the customer language:', error.message);
  return (data as { lang?: string } | null)?.lang ?? null;
}
