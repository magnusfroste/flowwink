import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';

/**
 * Visitor-facing UI strings that are not page content.
 *
 * Block content has always been editable — a title, a button label, a
 * thank-you. But the chrome around it was not: "Send message", "No results
 * found", "Back to homepage", "Previous page". A site launched in Swedish
 * translated everything an editor could reach and still said "Your message"
 * above the chat box. We found that class three times in one evening (cookie
 * banner, newsletter placeholders, the KB's "Can't find the answer?") before
 * measuring it: 120 hardcoded strings across 45 public files.
 *
 * Hardcoding Swedish would only move the problem to the next language, so the
 * strings become data, following the localization law — language is a pack the
 * engine reads, never a branch the engine takes.
 *
 * `site_settings.ui_text` holds a flat `{ key: translation }` map. Anything
 * absent falls back to the English written at the call site, so an instance
 * that never sets the key behaves exactly as it does today (Law 4: degrade,
 * never gate). An agent can translate a whole site through
 * `manage_site_settings` without a deploy.
 *
 * ── The language dimension ────────────────────────────────────────────────
 *
 * Block content became bilingual when a page got its own locale, but the
 * chrome did not: a visitor on the English version of a page still read
 * Swedish buttons. So the pack grew a second axis.
 *
 * The shape is ADDITIVE, not a migration. The flat map stays exactly what it
 * is — the instance's own strings, in whatever language the operator wrote
 * them — and per-language overlays live under reserved `@<locale>` keys:
 *
 *   {
 *     "chat.send": "Skicka",          ← the base layer, untouched
 *     "@en": { "chat.send": "Send" }  ← an overlay, only for English pages
 *   }
 *
 * That choice is what makes this safe. Every existing instance keeps a pure
 * flat map and resolves identically to before; the one admin surface that
 * writes ui_text spreads the object and therefore carries the overlays along
 * without knowing they exist; and `@` cannot collide with a real key, which
 * are all dotted (`page.notFound`).
 *
 * Resolution for a page in language L:
 *   1. `@L` exactly (e.g. `@sv-SE`), then its base subtag (`@sv`)
 *   2. the flat base layer — but ONLY when L is the site's own language
 *   3. the English fallback at the call site
 *
 * Step 2's condition is the whole point: on a Swedish site, an English page
 * must NOT fall through to the Swedish base layer, or the visitor gets Swedish
 * chrome around English content. Falling to the call-site English instead is
 * both correct and free.
 */

/** A base-layer string, or a per-language overlay under an `@<locale>` key. */
export type UiTextMap = Record<string, string | Record<string, string>>;

const OVERLAY_PREFIX = '@';

/** 'sv-SE' → 'sv'. A tag without a region is returned unchanged. */
function baseSubtag(tag: string): string {
  return String(tag || '').toLowerCase().split('-')[0];
}

interface UiTextValue {
  map: UiTextMap;
  /** The language the visitor is currently reading, BCP-47. */
  lang: string;
  /** The language the flat base layer is written in. */
  siteLang: string;
  setLang: (lang: string | null) => void;
}

const UiTextContext = createContext<UiTextValue>({
  map: {}, lang: 'en', siteLang: 'en', setLang: () => {},
});

export function UiTextProvider({ children }: { children: ReactNode }) {
  const { data } = useQuery({
    queryKey: ['site-settings', 'ui_text'],
    queryFn: async () => {
      const { data } = await supabase
        .from('site_settings').select('value').eq('key', 'ui_text').maybeSingle();
      return (data?.value as UiTextMap) || {};
    },
    staleTime: 10 * 60 * 1000,
    // A missing table/row must never blank the UI — the fallbacks carry it.
    retry: false,
  });

  // Read directly rather than through useSiteSettings: this provider sits above
  // everything and must not take on the settings module as a dependency.
  const { data: siteLocale } = useQuery({
    queryKey: ['site-settings', 'platform_locale', 'ui-text'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('site_settings').select('value').eq('key', 'platform_locale').maybeSingle();
      // Degrade, but say so. Without the site's own language the base layer is
      // assumed English, and a Swedish site would quietly lose its chrome
      // strings on every page — worth a line in the log, never a blank UI.
      if (error) logger.warn('[ui-text] platform_locale unreadable, assuming English base layer', error);
      return ((data?.value as { default_locale?: string })?.default_locale) || 'en';
    },
    staleTime: 10 * 60 * 1000,
    retry: false,
  });

  // null = "this page did not say", which resolves to the site's own language.
  const [pageLang, setPageLang] = useState<string | null>(null);
  const setLang = useCallback((lang: string | null) => {
    setPageLang((prev) => (prev === lang ? prev : lang));
  }, []);

  const siteLang = siteLocale ?? 'en';
  const value = useMemo<UiTextValue>(
    () => ({ map: data ?? {}, lang: pageLang ?? siteLang, siteLang, setLang }),
    [data, pageLang, siteLang, setLang],
  );

  return <UiTextContext.Provider value={value}>{children}</UiTextContext.Provider>;
}

/**
 * Lets the page being rendered declare which language the visitor is reading,
 * so the chrome follows the content. Pass null when the page does not say.
 */
export function useSetUiTextLang() {
  return useContext(UiTextContext).setLang;
}

/**
 * `const t = useUiText(); t('chat.send', 'Send message')`
 *
 * The English fallback is required and lives at the call site, so the code
 * stays readable and a missing pack is invisible rather than broken.
 */
/**
 * The resolver, as a plain function so it can be exercised without mounting a
 * provider or a query client. `useUiText` is a thin wrapper around it.
 */
export function resolveUiText(
  map: UiTextMap,
  lang: string,
  siteLang: string,
): (key: string, fallback: string) => string {
  const overlay = (tag: string): Record<string, string> | null => {
    const entry = map?.[OVERLAY_PREFIX + tag];
    return entry && typeof entry === 'object' ? entry as Record<string, string> : null;
  };
  const tag = String(lang || '').toLowerCase();
  const exact = overlay(tag);
  const base = tag === baseSubtag(tag) ? null : overlay(baseSubtag(tag));
  // The base layer is written in the site's own language. Falling through to it
  // from a DIFFERENT language would wrap English content in Swedish chrome.
  const useFlatLayer = baseSubtag(tag) === baseSubtag(siteLang);

  return (key: string, fallback: string): string => {
    const fromExact = exact?.[key];
    if (typeof fromExact === 'string' && fromExact) return fromExact;
    const fromBase = base?.[key];
    if (typeof fromBase === 'string' && fromBase) return fromBase;
    if (useFlatLayer) {
      const flat = map?.[key];
      if (typeof flat === 'string' && flat) return flat;
    }
    return fallback;
  };
}

export function useUiText() {
  const { map, lang, siteLang } = useContext(UiTextContext);
  return useMemo(() => resolveUiText(map, lang, siteLang), [map, lang, siteLang]);
}
