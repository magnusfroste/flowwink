import { setDefaultOptions } from 'date-fns';
import { sv, enGB, enUS, nb, da, fi, de, fr, es, nl } from 'date-fns/locale';
import type { Locale } from 'date-fns';

/**
 * Makes date-fns follow the platform locale — globally, in one place.
 *
 * Absolute dates go through `usePlatformFormat()` (Intl). But RELATIVE time
 * (`formatDistanceToNow`, `formatDistanceStrict`) is date-fns' own vocabulary:
 * it renders "3 days ago" from an English word list unless a `locale` is
 * supplied. There are ~97 such call sites; rather than thread a locale option
 * through every one, `setDefaultOptions` sets it once for the whole library.
 *
 * That also covers any remaining date-fns `format()` call that uses a localized
 * token (`PP`, `EEEE`), so the two mechanisms agree instead of drifting.
 *
 * Curated locale set, deliberately: `import * as locales from 'date-fns/locale'`
 * pulls ~200 locales into the bundle. Adding one here is a one-line change.
 */
const LOCALES: Record<string, Locale> = {
  sv, svSE: sv,
  enGB, enUS,
  nb, nbNO: nb,
  da, daDK: da,
  fi, fiFI: fi,
  de, deDE: de,
  fr, frFR: fr,
  es, esES: es,
  nl, nlNL: nl,
};

/**
 * Resolve a BCP-47 tag ("sv-SE", "en-GB") to a date-fns locale.
 * Tries the full region-qualified key first, then the bare language.
 * Falls back to en-US — date-fns' own default, so nothing gets worse.
 */
export function resolveDateFnsLocale(tag: string | null | undefined): Locale {
  if (!tag) return enUS;
  const [lang, region] = tag.split('-');
  if (region) {
    const qualified = `${lang.toLowerCase()}${region.toUpperCase()}`;
    if (LOCALES[qualified]) return LOCALES[qualified];
  }
  return LOCALES[lang.toLowerCase()] ?? enUS;
}

/** Point every date-fns call at the platform locale. Idempotent. */
export function applyDateFnsLocale(tag: string | null | undefined): void {
  setDefaultOptions({ locale: resolveDateFnsLocale(tag) });
}
