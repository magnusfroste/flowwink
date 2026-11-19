/**
 * Visitor text, resolved — the one resolver for the app and the edge.
 *
 * `site_settings.ui_text` is the instance's own strings (the flat base layer,
 * written in the site's language) plus per-language overlays under `@<locale>`
 * keys. The ladder for a reader in language L: `@L` (exact, then the same
 * language), the flat layer only when L is the site's language, then the
 * platform's own translation for L (PLATFORM_UI_TEXT — Swedish ships with the
 * platform), else the English at the call site. The full story is in src/lib/ui-text.tsx; this
 * module is the pure half so the invoice PDF reads the same words the invoice
 * page shows.
 */
import { pickLocale, baseSubtag } from './pick-locale.ts';
import { UI_TEXT_SV } from './ui-text-pack-sv.ts';

/** A base-layer string, or a per-language overlay under an `@<locale>` key. */
export type UiTextMap = Record<string, string | Record<string, string>>;

/** `t('invoice.total', 'Total')` — the English fallback lives at the call site. */
export type UiText = (key: string, fallback: string) => string;

const OVERLAY_PREFIX = '@';

/**
 * What the platform itself ships per language, keyed by base subtag. Before
 * 2026-11-19 a text was English until an instance translated it, so the
 * language set in settings governed only what somebody had got round to.
 */
export const PLATFORM_UI_TEXT: Record<string, Record<string, string>> = { sv: UI_TEXT_SV };

/**
 * The resolver, as a plain function so it can be exercised without mounting a
 * provider or a query client. `useUiText` is a thin wrapper around it.
 */
export function resolveUiText(
  map: UiTextMap,
  lang: string,
  siteLang: string,
): UiText {
  const overlay = (tag: string | null): Record<string, string> | null => {
    if (!tag) return null;
    const entry = map?.[OVERLAY_PREFIX + tag];
    return entry && typeof entry === 'object' ? entry as Record<string, string> : null;
  };
  const tag = String(lang || '').toLowerCase();

  // Same ladder as everywhere else — exact tag, then the same language — but
  // deliberately WITHOUT a fallback: falling through to the site's own overlay
  // is the flat base layer's job below, and only when the language matches.
  const available = Object.keys(map ?? {})
    .filter((k) => k.startsWith(OVERLAY_PREFIX) && typeof map[k] === 'object')
    .map((k) => k.slice(OVERLAY_PREFIX.length));
  const exact = overlay(pickLocale({ available, wanted: tag }));
  const base = null;
  // The base layer is written in the site's own language. Falling through to it
  // from a DIFFERENT language would wrap English content in Swedish chrome.
  const useFlatLayer = baseSubtag(tag) === baseSubtag(siteLang);
  // An instance's own wording always wins; the platform's fills what is left.
  const platform = PLATFORM_UI_TEXT[baseSubtag(tag)] ?? null;

  return (key: string, fallback: string): string => {
    const fromExact = exact?.[key];
    if (typeof fromExact === 'string' && fromExact) return fromExact;
    const fromBase = base?.[key];
    if (typeof fromBase === 'string' && fromBase) return fromBase;
    if (useFlatLayer) {
      const flat = map?.[key];
      if (typeof flat === 'string' && flat) return flat;
    }
    const shipped = platform?.[key];
    if (typeof shipped === 'string' && shipped) return shipped;
    return fallback;
  };
}
