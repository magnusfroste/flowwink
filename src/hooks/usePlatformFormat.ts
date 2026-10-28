import { useMemo } from 'react';
import { useBusinessHome, type PlatformLocaleSettings } from '@/hooks/useSiteSettings';
import { FALLBACK_HOME } from '../../supabase/functions/_shared/locale/home';

/**
 * Platform-level formatting hook — the single source of truth for how money,
 * dates and numbers are rendered in the UI.
 *
 * Rules (deliberate, do not "improve" these away):
 *  - Locale controls FORMAT, currency controls the SYMBOL. Currency is never
 *    derived from the locale. `formatCurrency(1900, 'USD')` under sv-SE gives
 *    Swedish grouping with a USD symbol.
 *  - This hook FORMATS, it never CONVERTS. No FX anywhere in here — conversion
 *    is an explicit, rate-stamped accounting operation.
 *  - *_cents is hundredths in every currency (fixed-point, like Stripe's ISK
 *    and Odoo's numeric): always ÷100. The currency decides only the decimals
 *    SHOWN, via Intl (JPY 0, SEK 2). docs/architecture/locale-and-formatting.md §3b.
 *  - `formatDate` is for date-only values and applies NO timezone shifting.
 *    `formatDateTime` applies the platform timezone to real timestamps.
 *
 * Presentation currency (this hook) is NOT the accounting/functional currency.
 * Keep them separate.
 */

/** Digits of the currency's minor unit, per Intl. Falls back to 2. */
function minorUnitDigits(locale: string, currency: string): number {
  try {
    const opts = new Intl.NumberFormat(locale, { style: 'currency', currency }).resolvedOptions();
    return opts.maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

export interface PlatformFormat {
  settings: PlatformLocaleSettings;
  /**
   * Amount is given in MINOR units (öre/cents/…) of `currency`.
   *
   * `options` is a narrow escape hatch for presentation-only tweaks — chiefly
   * `maximumFractionDigits: 0` for whole-unit displays (salary bands, KPI
   * tiles) that would otherwise gain a misleading ",00". It must never be used
   * to change the currency or the locale.
   */
  formatCurrency: (
    amountMinorUnits: number | null | undefined,
    currency?: string | null,
    options?: Omit<Intl.NumberFormatOptions, 'style' | 'currency'>,
  ) => string;
  /**
   * Date-only value ("2026-07-08" or a Date) — never timezone-shifted.
   *
   * `options` tunes the SHAPE only. It must never set `timeZone` — the UTC
   * anchor is what stops a date-only value drifting a day, so it is applied last.
   *
   * GOTCHA: options MERGE over the defaults (`year`,`month`,`day`); they do not
   * replace them. To drop a field you must pass it as `undefined` explicitly:
   *
   *   formatDate(d, { month: 'short', day: 'numeric' })                  // "08 juli 2026"
   *   formatDate(d, { year: undefined, month: 'short', day: 'numeric' }) // "8 juli"  ← compact
   *
   * Forgetting `year: undefined` is the usual cause of a chart axis or chip
   * blowing out its width.
   */
  formatDate: (
    dateOnly: string | Date | null | undefined,
    options?: Omit<Intl.DateTimeFormatOptions, 'timeZone'>,
  ) => string;
  /**
   * Real timestamp — rendered in the platform timezone.
   *
   * Same merge semantics as `formatDate`: pass `hour: undefined, minute: undefined`
   * to render a timestamp as a bare day. Prefer that over `formatDate` for a
   * timestamptz column — `formatDate` would take the UTC calendar date, which
   * shows the PREVIOUS day for late-evening records in an eastward timezone.
   */
  formatDateTime: (
    timestamp: string | Date | null | undefined,
    options?: Omit<Intl.DateTimeFormatOptions, 'timeZone'>,
  ) => string;
  /**
   * Clock time of a TIMESTAMP, in the platform timezone.
   *
   * Use this instead of date-fns `format(d,'HH:mm')`, which renders in the
   * BROWSER's zone — that puts a platform-zone date next to a browser-zone time
   * in the same row, and splits a range like "09:00 – 17:00" across two zones.
   *
   * NOT for `time` columns (shift start, booking slot). Those are wall-clock
   * values with no timezone; run them through here and you reinterpret them as
   * instants. Render those as stored.
   */
  formatTime: (
    timestamp: string | Date | null | undefined,
    options?: Omit<Intl.DateTimeFormatOptions, 'timeZone'>,
  ) => string;
  formatNumber: (n: number | null | undefined, options?: Intl.NumberFormatOptions) => string;
  /**
   * An amount in MINOR units with NO currency symbol — ledger columns and
   * reports, where the currency is the column's. The site's decimals setting
   * applies; `wholeUnits` forces whole units (a report's "hide öre" toggle).
   * Negatives use the true minus sign (U+2212), as ledgers print it.
   */
  formatAmount: (
    amountMinorUnits: number | null | undefined,
    options?: { wholeUnits?: boolean; currency?: string | null },
  ) => string;
}

/**
 * The fraction digits an amount is shown with: the site's amount_decimals
 * setting fills whichever of minimum/maximum the call site did not set, and
 * the pair is clamped so Intl never sees min > max (it throws). 'auto' or
 * unset leaves everything to the call site and the currency. Exported for tests.
 */
export function amountDecimalsDefault(
  setting: PlatformLocaleSettings['amount_decimals'],
  options?: Intl.NumberFormatOptions,
): Intl.NumberFormatOptions {
  const out: Intl.NumberFormatOptions = { ...(options ?? {}) };
  if (setting === 0 || setting === 2) {
    if (out.minimumFractionDigits === undefined) out.minimumFractionDigits = setting;
    if (out.maximumFractionDigits === undefined) out.maximumFractionDigits = setting;
  }
  if (out.minimumFractionDigits !== undefined && out.maximumFractionDigits !== undefined
      && out.minimumFractionDigits > out.maximumFractionDigits) {
    out.minimumFractionDigits = out.maximumFractionDigits;
  }
  return out;
}

export function usePlatformFormat(): PlatformFormat {
  // The same home every e-mail and PDF is written from (resolveHome).
  const home = useBusinessHome().data ?? FALLBACK_HOME;
  return useMemo(
    () => makePlatformFormat({
      default_locale: home.locale,
      default_currency: home.currency,
      default_timezone: home.timeZone,
      amount_decimals: home.amountDecimals,
    }),
    [home.locale, home.currency, home.timeZone, home.amountDecimals],
  );
}

/**
 * The formatter for given settings — usePlatformFormat (the admin) and
 * useCustomerFormat (a customer: the reader's language, exact amounts) are
 * the same rules over different settings.
 */
export function makePlatformFormat(s: PlatformLocaleSettings): PlatformFormat {
  {
    const locale = s.default_locale ?? FALLBACK_HOME.locale;
    const tz = s.default_timezone;

    const formatCurrency = (
      amountMinorUnits: number | null | undefined,
      currency?: string | null,
      options?: Omit<Intl.NumberFormatOptions, 'style' | 'currency'>,
    ) => {
      if (amountMinorUnits == null || Number.isNaN(amountMinorUnits)) return '—';
      const cur = (currency || s.default_currency).toUpperCase();
      // *_cents is hundredths in EVERY currency (locale-and-formatting.md §3b):
      // 1 000 JPY is 100000. The currency only decides the decimals shown.
      const major = amountMinorUnits / 100;
      // The site's one decimals setting is the DEFAULT; a call site that asks
      // for something specific (a summary card in whole units) keeps it.
      const shown = amountDecimalsDefault(s.amount_decimals, options);
      try {
        return new Intl.NumberFormat(locale, {
          ...shown,
          style: 'currency',
          currency: cur,
        }).format(major);
      } catch {
        return `${major.toFixed(minorUnitDigits(locale, cur))} ${cur}`;
      }
    };

    const formatDate = (
      dateOnly: string | Date | null | undefined,
      options?: Omit<Intl.DateTimeFormatOptions, 'timeZone'>,
    ) => {
      if (!dateOnly) return '—';
      // Date-only must never shift across a timezone boundary: parse the
      // Y-M-D parts and render them literally (UTC anchor + UTC formatting).
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
        return new Intl.DateTimeFormat(locale, {
          year: 'numeric',
          month: 'short',
          day: '2-digit',
          ...options,
          // Applied LAST and non-overridable: the UTC anchor is the whole
          // reason a date-only value cannot drift across a day boundary.
          timeZone: 'UTC',
        }).format(anchor);
      } catch {
        return anchor.toISOString().slice(0, 10);
      }
    };

    const formatDateTime = (
      timestamp: string | Date | null | undefined,
      options?: Omit<Intl.DateTimeFormatOptions, 'timeZone'>,
    ) => {
      if (!timestamp) return '—';
      const dt = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
      if (Number.isNaN(dt.getTime())) return '—';
      try {
        return new Intl.DateTimeFormat(locale, {
          year: 'numeric',
          month: 'short',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          ...options,
          // Applied LAST: a timestamp must always render in the platform zone,
          // otherwise two users would read the same instant differently.
          timeZone: tz,
        }).format(dt);
      } catch {
        return dt.toISOString();
      }
    };

    const formatTime = (
      timestamp: string | Date | null | undefined,
      options?: Omit<Intl.DateTimeFormatOptions, 'timeZone'>,
    ) => {
      if (!timestamp) return '—';
      const dt = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
      if (Number.isNaN(dt.getTime())) return '—';
      try {
        return new Intl.DateTimeFormat(locale, {
          hour: '2-digit',
          minute: '2-digit',
          ...options,
          // Same invariant as formatDateTime: the platform zone is not optional,
          // or two users read the same instant as different clock times.
          timeZone: tz,
        }).format(dt);
      } catch {
        return dt.toISOString().slice(11, 16);
      }
    };

    const formatNumber = (n: number | null | undefined, options?: Intl.NumberFormatOptions) => {
      if (n == null || Number.isNaN(n)) return '—';
      try {
        return new Intl.NumberFormat(locale, options).format(n);
      } catch {
        return String(n);
      }
    };

    const formatAmount: PlatformFormat['formatAmount'] = (amountMinorUnits, options) => {
      if (amountMinorUnits == null || Number.isNaN(amountMinorUnits)) return '—';
      const digits = minorUnitDigits(locale, (options?.currency || s.default_currency).toUpperCase());
      const shown = options?.wholeUnits ? 0
        : s.amount_decimals === 0 || s.amount_decimals === 2 ? s.amount_decimals
        : digits;
      try {
        return new Intl.NumberFormat(locale, { minimumFractionDigits: shown, maximumFractionDigits: shown })
          .format(amountMinorUnits / 100)
          .replace('-', '\u2212');
      } catch {
        return (amountMinorUnits / 100).toFixed(shown);
      }
    };

    return { settings: s, formatCurrency, formatDate, formatDateTime, formatTime, formatNumber, formatAmount };
  }
}
