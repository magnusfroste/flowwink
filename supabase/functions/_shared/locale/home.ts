/**
 * The business's home — where it is, what money it counts in, what clock it
 * keeps — and how an amount, a date or a time is written from there.
 *
 * One answer for the admin app (usePlatformFormat), every e-mail, the invoice
 * PDF and every reminder. Before this, the server never asked: invoices were
 * hard-coded sv-SE, booking mails en-US, and reminder times were written in
 * the edge runtime's own zone, UTC — a 10:00 Stockholm booking said "08:00 AM".
 *
 *   home = { country, currency, timeZone }   facts about the business
 *   format locale = text language + home region
 *
 * The second line is the point: an English mail from a Swedish business says
 * "3 July 2026 at 10:00" and "1 234,50 kr" (`en-SE`) — English words, the
 * business's own numbers and 24-hour clock. The language comes from whoever
 * reads it; the region never moves.
 *
 * Read order (Law 4 — every instance keeps what it shows today):
 *   platform_locale (the admin's Locale & formatting card)
 *   > accounting_preferences.currency (the old accounting dial)
 *   > general.country's defaults
 *   > the platform fallback, sv-SE / SEK / Europe/Stockholm
 *
 * NO imports on purpose: the Deno runtime and Vite/vitest both read this file.
 * Design: docs/architecture/locale-and-formatting.md.
 */

export type AmountDecimals = 'auto' | 0 | 2;

export interface Home {
  /** ISO 3166-1 alpha-2, or null when nobody said. */
  country: string | null;
  /** BCP-47 — the admin's format locale, region included (sv-SE). */
  locale: string;
  /** ISO 4217 — the currency an amount without its own is shown in. */
  currency: string;
  /** IANA — every timestamp is written on this clock. */
  timeZone: string;
  amountDecimals: AmountDecimals;
}

export const FALLBACK_HOME: Home = {
  country: null,
  locale: 'sv-SE',
  currency: 'SEK',
  timeZone: 'Europe/Stockholm',
  amountDecimals: 'auto',
};

/** The site_settings keys `resolveHome` reads — select exactly these. */
export const HOME_SETTING_KEYS = ['platform_locale', 'general', 'accounting_preferences', 'site_languages'] as const;

interface CountryDefaults { currency: string; timeZone: string; language: string }

/**
 * What a country implies when nobody chose. A country with several zones
 * names its most populous one; the admin picks another where it matters.
 */
export const COUNTRY_DEFAULTS: Readonly<Record<string, CountryDefaults>> = {
  SE: { currency: 'SEK', timeZone: 'Europe/Stockholm', language: 'sv' },
  NO: { currency: 'NOK', timeZone: 'Europe/Oslo', language: 'nb' },
  DK: { currency: 'DKK', timeZone: 'Europe/Copenhagen', language: 'da' },
  FI: { currency: 'EUR', timeZone: 'Europe/Helsinki', language: 'fi' },
  IS: { currency: 'ISK', timeZone: 'Atlantic/Reykjavik', language: 'is' },
  EE: { currency: 'EUR', timeZone: 'Europe/Tallinn', language: 'et' },
  DE: { currency: 'EUR', timeZone: 'Europe/Berlin', language: 'de' },
  AT: { currency: 'EUR', timeZone: 'Europe/Vienna', language: 'de' },
  CH: { currency: 'CHF', timeZone: 'Europe/Zurich', language: 'de' },
  NL: { currency: 'EUR', timeZone: 'Europe/Amsterdam', language: 'nl' },
  BE: { currency: 'EUR', timeZone: 'Europe/Brussels', language: 'nl' },
  FR: { currency: 'EUR', timeZone: 'Europe/Paris', language: 'fr' },
  ES: { currency: 'EUR', timeZone: 'Europe/Madrid', language: 'es' },
  IT: { currency: 'EUR', timeZone: 'Europe/Rome', language: 'it' },
  PL: { currency: 'PLN', timeZone: 'Europe/Warsaw', language: 'pl' },
  GB: { currency: 'GBP', timeZone: 'Europe/London', language: 'en' },
  IE: { currency: 'EUR', timeZone: 'Europe/Dublin', language: 'en' },
  US: { currency: 'USD', timeZone: 'America/New_York', language: 'en' },
  CA: { currency: 'CAD', timeZone: 'America/Toronto', language: 'en' },
  AU: { currency: 'AUD', timeZone: 'Australia/Sydney', language: 'en' },
};

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

export function isTimeZone(tz: string): boolean {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function isCurrency(code: string): boolean {
  if (!/^[A-Z]{3}$/.test(code)) return false;
  try {
    new Intl.NumberFormat('en', { style: 'currency', currency: code });
    return true;
  } catch {
    return false;
  }
}

/** A BCP-47 tag Intl can format with, canonicalised (sv-se → sv-SE), or ''. */
export function canonicalLocale(tag: string): string {
  if (!tag) return '';
  try {
    const [c] = Intl.getCanonicalLocales(tag);
    return c && Intl.NumberFormat.supportedLocalesOf([c]).length ? c : '';
  } catch {
    return '';
  }
}

function regionOf(locale: string): string {
  try {
    return new Intl.Locale(locale).region ?? '';
  } catch {
    return '';
  }
}

/**
 * True when Intl really formats `tag` with its region. A runtime with trimmed
 * locale data (Chrome ships without en-NO, en-IS, en-EE) still "supports"
 * them — by quietly falling back to `en`, which writes US numbers and a 12-hour
 * clock. Only a resolved locale that keeps the region counts.
 */
function keepsRegion(tag: string): boolean {
  try {
    const want = new Intl.Locale(tag);
    const got = new Intl.Locale(new Intl.NumberFormat(tag).resolvedOptions().locale);
    return got.language === want.language && (!want.region || got.region === want.region);
  } catch {
    return false;
  }
}

/**
 * The best locale for words in `language` written the way `region` writes
 * numbers: language-REGION when the runtime has it; else, for English, en-GB
 * (day-month order, 24-hour clock); else the language alone.
 */
export function localeFor(language: string, region: string): string {
  const lang = languageOf(language);
  if (!lang) return '';
  const exact = region ? canonicalLocale(`${lang}-${region}`) : '';
  if (exact && keepsRegion(exact)) return exact;
  if (lang === 'en' && region !== 'US') return 'en-GB';
  return canonicalLocale(lang);
}

function languageOf(tag: string): string {
  return str(tag).toLowerCase().split(/[-_]/)[0];
}

/** The settings rows, as `site_settings` stores them, keyed by `key`. */
export type HomeSettingRows = Partial<Record<(typeof HOME_SETTING_KEYS)[number], unknown>>;

/** Where each value of the home came from — what get_business_home reports. */
export interface HomeSources {
  country: 'general.country' | 'unset';
  locale: 'platform_locale.default_locale' | 'site language + country' | 'fallback';
  currency: 'platform_locale.default_currency' | 'accounting_preferences.currency' | 'country' | 'fallback';
  timeZone: 'platform_locale.default_timezone' | 'country' | 'fallback';
}

export function resolveHomeWithSources(rows: HomeSettingRows): { home: Home; sources: HomeSources } {
  const pl = obj(rows.platform_locale);
  const general = obj(rows.general);
  const acct = obj(rows.accounting_preferences);
  const langs = obj(rows.site_languages);

  const country = str(general.country).toUpperCase() || null;
  const byCountry = country ? COUNTRY_DEFAULTS[country] : undefined;
  const siteLanguage = languageOf(str(langs.default));

  const stored = canonicalLocale(str(pl.default_locale));
  const derived = country ? localeFor(siteLanguage || byCountry?.language || 'en', country) : '';
  const locale = stored || derived || FALLBACK_HOME.locale;

  const currencies: Array<[string, HomeSources['currency']]> = [
    [str(pl.default_currency).toUpperCase(), 'platform_locale.default_currency'],
    [str(acct.currency).toUpperCase(), 'accounting_preferences.currency'],
    [byCountry?.currency ?? '', 'country'],
  ];
  const cur = currencies.find(([c]) => isCurrency(c));

  const zones: Array<[string, HomeSources['timeZone']]> = [
    [str(pl.default_timezone), 'platform_locale.default_timezone'],
    [byCountry?.timeZone ?? '', 'country'],
  ];
  const tz = zones.find(([z]) => isTimeZone(z));

  const d = pl.amount_decimals;
  const amountDecimals: AmountDecimals = d === 0 || d === 2 ? d : 'auto';

  return {
    home: {
      country,
      locale,
      currency: cur?.[0] ?? FALLBACK_HOME.currency,
      timeZone: tz?.[0] ?? FALLBACK_HOME.timeZone,
      amountDecimals,
    },
    sources: {
      country: country ? 'general.country' : 'unset',
      locale: stored ? 'platform_locale.default_locale' : derived ? 'site language + country' : 'fallback',
      currency: cur?.[1] ?? 'fallback',
      timeZone: tz?.[1] ?? 'fallback',
    },
  };
}

export function resolveHome(rows: HomeSettingRows): Home {
  return resolveHomeWithSources(rows).home;
}

/**
 * The locale to write in for a reader of `language`: the home locale when the
 * languages agree, else that language in the home region (en + SE → en-SE).
 */
export function formatLocale(home: Home, language?: string | null): string {
  const want = languageOf(language ?? '');
  if (!want || want === languageOf(home.locale)) return home.locale;
  const region = regionOf(home.locale) || home.country || '';
  return localeFor(want, region) || home.locale;
}

export interface HomeFormat {
  locale: string;
  timeZone: string;
  /** An amount in MINOR units of `currency` (öre, cents …). */
  money: (amountMinor: number | null | undefined, currency?: string | null) => string;
  /** A date-only value ("2026-07-03") — never shifted by a zone. */
  date: (dateOnly: string | Date | null | undefined, options?: Omit<Intl.DateTimeFormatOptions, 'timeZone'>) => string;
  /** A timestamp, on the home clock. */
  dateTime: (ts: string | Date | null | undefined, options?: Omit<Intl.DateTimeFormatOptions, 'timeZone'>) => string;
  /** The clock time of a timestamp, on the home clock. */
  time: (ts: string | Date | null | undefined, options?: Omit<Intl.DateTimeFormatOptions, 'timeZone'>) => string;
}

function minorDigits(locale: string, currency: string): number {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

function toDate(v: string | Date | null | undefined): Date | null {
  if (v == null || v === '') return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Same rules as the admin's usePlatformFormat, for code that is not React.
 *
 * `audience: 'admin'` applies the admin's "decimals in amounts" choice. The
 * default, a customer, always gets the currency's own digits: that dial is a
 * reading aid for the admin, and an invoice saying 1 235 kr for 1 234,50 is
 * a wrong invoice.
 */
export function homeFormat(home: Home, language?: string | null, opts: { audience?: 'customer' | 'admin' } = {}): HomeFormat {
  const locale = formatLocale(home, language);
  const timeZone = home.timeZone;
  return {
    locale,
    timeZone,
    money(amountMinor, currency) {
      if (amountMinor == null || Number.isNaN(amountMinor)) return '—';
      const cur = (str(currency) || home.currency).toUpperCase();
      const major = amountMinor / Math.pow(10, minorDigits(locale, cur));
      const digits = opts.audience !== 'admin' || home.amountDecimals === 'auto' ? {} : { minimumFractionDigits: home.amountDecimals, maximumFractionDigits: home.amountDecimals };
      try {
        return new Intl.NumberFormat(locale, { ...digits, style: 'currency', currency: cur }).format(major);
      } catch {
        return `${major.toFixed(2)} ${cur}`;
      }
    },
    date(dateOnly, options) {
      // A bare "YYYY-MM-DD" is midnight UTC; written in UTC it stays that day.
      const d = toDate(dateOnly);
      if (!d) return '';
      return new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long', day: 'numeric', ...options, timeZone: 'UTC' }).format(d);
    },
    dateTime(ts, options) {
      const d = toDate(ts);
      if (!d) return '';
      // dateStyle cannot be mixed with field options (Intl throws), so the
      // default shape applies only when the caller asked for none.
      const shape = options && Object.keys(options).length ? options : { dateStyle: 'long', timeStyle: 'short' } as const;
      return new Intl.DateTimeFormat(locale, { ...shape, timeZone }).format(d);
    },
    time(ts, options) {
      const d = toDate(ts);
      if (!d) return '';
      return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', ...options, timeZone }).format(d);
    },
  };
}
