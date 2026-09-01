import { useMemo } from 'react';
import { useUiTextLanguage } from '@/lib/ui-text';

/**
 * Date rendering that follows the VISITOR's language, not the platform locale.
 *
 * Weekday and month NAMES are language, not format. `usePlatformFormat` is the
 * right owner of grouping, currency symbols and timezone — but its locale is
 * `platform_locale`, which is a formatting setting (see
 * docs/architecture/language.md §0: "not language; never confuse the two").
 * A visitor on the English version of a page was reading "mån, tis, ons" and
 * "31 aug. 2026" in the booking calendar because the names rode along with the
 * format locale.
 *
 * This formatter keeps `formatDate`'s exact semantics — date-only, UTC-anchored
 * so a value can never drift across a day boundary, same defaults, same
 * options-merge behaviour — and takes ONLY the locale from the language the
 * visitor is currently reading (`useUiTextLanguage().lang`, which already
 * resolves to the site's own language when the page did not say).
 *
 * Scope: visitor-facing name-bearing dates (a booking calendar's weekday row,
 * a "Monday, September 7, 2026" confirmation). Numbers, currency and admin
 * surfaces stay on `usePlatformFormat`.
 */
export function formatVisitorDate(
  lang: string,
  dateOnly: string | Date | null | undefined,
  options?: Omit<Intl.DateTimeFormatOptions, 'timeZone'>,
): string {
  if (!dateOnly) return '—';
  let y: number, m: number, d: number;
  if (typeof dateOnly === 'string') {
    const match = dateOnly.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return dateOnly;
    [, y, m, d] = match.map(Number) as unknown as [unknown, number, number, number];
  } else {
    y = dateOnly.getFullYear();
    m = dateOnly.getMonth() + 1;
    d = dateOnly.getDate();
  }
  const anchor = new Date(Date.UTC(y, m - 1, d));
  try {
    return new Intl.DateTimeFormat(lang, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      ...options,
      // Applied LAST and non-overridable, same as the platform formatter: the
      // UTC anchor is what stops a date-only value drifting a day.
      timeZone: 'UTC',
    }).format(anchor);
  } catch {
    return anchor.toISOString().slice(0, 10);
  }
}

/** `formatVisitorDate` bound to the language the visitor is reading. */
export function useVisitorDateFormat() {
  const { lang, siteLang } = useUiTextLanguage();
  const locale = lang || siteLang;
  return useMemo(
    () => ({
      formatDate: (
        dateOnly: string | Date | null | undefined,
        options?: Omit<Intl.DateTimeFormatOptions, 'timeZone'>,
      ) => formatVisitorDate(locale, dateOnly, options),
    }),
    [locale],
  );
}
